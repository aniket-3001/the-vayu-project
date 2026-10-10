import { createHash } from 'node:crypto';
import { FireReport } from '@vayu/contracts';
import type { Clock } from '@vayu/core';
import { dayKey, type Quota } from './quota';
import { failure, ok, type ApiRequest, type ApiResponse } from './respond';

export interface FireReportsDeps {
  readonly save: (id: string, report: FireReport, receivedAt: string) => Promise<void>;
  readonly quota: Quota;
  readonly clock: Clock;
  /** Added to the caller's address before it is hashed, so the hash cannot be looked up elsewhere. */
  readonly salt: string;
}

/** Each caller (by a day-long hash of their address) and the whole service can only send so many a day. */
export const FIRE_REPORTS_PER_CALLER_PER_DAY = 10;
export const FIRE_REPORTS_PER_DAY = 500;
const DAY_SECONDS = 2 * 86_400;
const MAX_BODY_BYTES = 1_000;

/**
 * `POST /v1/fire-reports`: someone says a fire is burning at a place. The body is checked against the contract
 * and refused if it has anything else in it. It is kept for 180 days, never the caller's address (only a hash
 * that changes every day, for the daily limit), and nothing is sent to anyone: a person reads these.
 */
export async function handleFireReports(
  request: ApiRequest,
  deps: FireReportsDeps,
): Promise<ApiResponse> {
  if (request.method !== 'POST')
    return failure(405, 'method_not_allowed', `${request.method} is not supported here`);
  const body = request.body ?? '';
  if (body.length > MAX_BODY_BYTES) return failure(413, 'too_large', 'That report is too large.');
  let raw: unknown;
  try {
    raw = JSON.parse(body === '' ? '{}' : body);
  } catch {
    return failure(400, 'invalid_body', 'The request body is not valid JSON');
  }
  const parsed = FireReport.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return failure(
      400,
      'invalid_request',
      first?.message ?? 'The report is not valid',
      first === undefined || first.path.length === 0 ? undefined : first.path.join('.'),
    );
  }

  const now = deps.clock.now();
  const day = dayKey(now);
  const caller = createHash('sha256')
    .update(`${deps.salt}|${day}|${request.sourceIp ?? 'unknown'}`)
    .digest('hex')
    .slice(0, 16);
  if (
    !(await deps.quota.take(
      `firereports#caller#${day}#${caller}`,
      FIRE_REPORTS_PER_CALLER_PER_DAY,
      DAY_SECONDS,
    ))
  )
    return failure(
      429,
      'too_many_requests',
      'You have sent a few reports already today. Thank you.',
    );
  if (!(await deps.quota.take(`firereports#all#${day}`, FIRE_REPORTS_PER_DAY, DAY_SECONDS)))
    return failure(
      429,
      'busy',
      'We are getting a lot of reports today. Please try again tomorrow.',
    );

  const id = `f${String(Date.parse(now))}${createHash('sha256').update(`${caller}${body}`).digest('hex').slice(0, 6)}`;
  await deps.save(id, parsed.data, now);
  return ok({ received: true, id });
}
