import { createHash } from 'node:crypto';
import type { Clock } from '@vayu/core';
import { parseBatch } from './analyticsModel';
import type { AnalyticsStore } from './analyticsStore';
import { dayKey, type Quota } from './quota';
import { failure, ok, type ApiRequest, type ApiResponse } from './respond';

export interface EventsDeps {
  readonly store: AnalyticsStore;
  readonly quota: Quota;
  readonly clock: Clock;
  /** Added to the caller's address before it is hashed, so the hash cannot be looked up elsewhere. */
  readonly salt: string;
}

export const EVENTS_PER_DEVICE_PER_DAY = 2000;
export const EVENTS_PER_CALLER_PER_DAY = 5000;
export const MAX_BODY_BYTES = 20_000;
const DAY_SECONDS = 2 * 86_400;

/**
 * `POST /v1/events` (anyone) and `POST /v1/me/events` (signed in): batches of usage events from the app. The second
 * path is checked by API Gateway, which says who is signed in; the first ignores any identity. Who the person is is
 * never taken from the body.
 */
export async function handleEvents(request: ApiRequest, deps: EventsDeps): Promise<ApiResponse> {
  if (request.method !== 'POST')
    return failure(405, 'method_not_allowed', `${request.method} is not supported here`);
  const signedInOnly = request.path === '/v1/me/events';
  if (signedInOnly && (request.userId === undefined || request.userId === ''))
    return failure(401, 'sign_in_needed', 'Sign in first.');
  const body = request.body ?? '';
  if (body.length > MAX_BODY_BYTES) return failure(413, 'too_large', 'That is too much to send.');
  let raw: unknown;
  try {
    raw = JSON.parse(body === '' ? '{}' : body);
  } catch {
    return failure(400, 'invalid_body', 'The request body is not valid JSON');
  }
  const parsed = parseBatch(raw);
  if (!parsed.ok) return failure(400, parsed.code, parsed.message);
  const { batch } = parsed;

  const now = deps.clock.now();
  const day = dayKey(now);
  const caller = createHash('sha256')
    .update(`${deps.salt}|${day}|${request.sourceIp ?? 'unknown'}`)
    .digest('hex')
    .slice(0, 16);
  const amount = batch.events.length;
  if (
    !(await deps.quota.take(`evt-dev:${day}:${batch.deviceId}`, EVENTS_PER_DEVICE_PER_DAY, DAY_SECONDS, amount)) ||
    !(await deps.quota.take(`evt-ip:${day}:${caller}`, EVENTS_PER_CALLER_PER_DAY, DAY_SECONDS, amount))
  )
    return failure(429, 'slow_down', 'Too many events today.');

  const signedIn = request.userId !== undefined && request.userId !== '';
  await deps.store.record({
    batch,
    now,
    ...(signedInOnly && signedIn
      ? { userId: request.userId, ...(request.email === undefined ? {} : { email: request.email }) }
      : {}),
  });
  return ok({ accepted: amount });
}
