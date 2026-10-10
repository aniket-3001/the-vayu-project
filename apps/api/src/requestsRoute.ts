import { createHash } from 'node:crypto';
import { AccessRequest } from '@vayu/contracts';
import type { Clock } from '@vayu/core';
import { dayKey, type Quota } from './quota';
import { failure, ok, type ApiRequest, type ApiResponse } from './respond';

export interface RequestsDeps {
  readonly save: (id: string, request: AccessRequest, receivedAt: string) => Promise<void>;
  readonly quota: Quota;
  readonly clock: Clock;
  /** Added to the caller's address before it is hashed, so the hash cannot be looked up elsewhere. */
  readonly salt: string;
}

/** Each caller (by a day-long hash of their address) and the whole service can only send so many a day. */
export const REQUESTS_PER_CALLER_PER_DAY = 5;
export const REQUESTS_PER_DAY = 200;
const DAY_SECONDS = 2 * 86_400;
const MAX_BODY_BYTES = 4_000;

/**
 * `POST /v1/requests`: someone asks for a demo or for monitors. The body is checked against the contract and
 * refused if it has anything else in it. It is kept for 180 days, never the caller's address (only a hash that
 * changes every day, for the daily limit), and nothing is sent to anyone: a person reads these.
 */
export async function handleRequests(
  request: ApiRequest,
  deps: RequestsDeps,
): Promise<ApiResponse> {
  if (request.method !== 'POST')
    return failure(405, 'method_not_allowed', `${request.method} is not supported here`);
  const body = request.body ?? '';
  if (body.length > MAX_BODY_BYTES) return failure(413, 'too_large', 'That request is too large.');
  let raw: unknown;
  try {
    raw = JSON.parse(body === '' ? '{}' : body);
  } catch {
    return failure(400, 'invalid_body', 'The request body is not valid JSON');
  }
  const parsed = AccessRequest.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return failure(
      400,
      'invalid_request',
      first?.message ?? 'The request is not valid',
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
      `requests#caller#${day}#${caller}`,
      REQUESTS_PER_CALLER_PER_DAY,
      DAY_SECONDS,
    ))
  )
    return failure(
      429,
      'too_many_requests',
      'You have sent a few already today. We will be in touch.',
    );
  if (!(await deps.quota.take(`requests#all#${day}`, REQUESTS_PER_DAY, DAY_SECONDS)))
    return failure(
      429,
      'busy',
      'We are getting a lot of requests today. Please try again tomorrow.',
    );

  const id = `r${String(Date.parse(now))}${createHash('sha256').update(`${caller}${body}`).digest('hex').slice(0, 6)}`;
  await deps.save(id, parsed.data, now);
  return ok({ received: true, id });
}
