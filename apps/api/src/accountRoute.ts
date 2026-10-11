import type { Clock } from '@vayu/core';
import type { AccountStore } from './accountStore';
import { failure, ok, type ApiRequest, type ApiResponse } from './respond';

export interface AccountDeps {
  readonly store: AccountStore;
  readonly clock: Clock;
}

/** What the browser is allowed to keep on an account: keys the app itself writes, small values, not many. */
const KEY = /^vayu\.[A-Za-z0-9_.:-]{1,60}$/u;
const MAX_KEYS = 40;
const MAX_BODY_BYTES = 100_000;

/**
 * `GET`, `PUT` and `DELETE /v1/me`: the settings a person saved to their account. API Gateway has already checked the
 * sign-in (the token's signature, issuer, audience and expiry) before this runs, and passes who it was; with no one,
 * this refuses. A person can only ever reach their own item, because the key is the user id from the token and
 * nothing in the request.
 */
export async function handleAccount(request: ApiRequest, deps: AccountDeps): Promise<ApiResponse> {
  const userId = request.userId;
  if (userId === undefined || userId === '')
    return failure(401, 'sign_in_needed', 'Sign in to use your account.');

  if (request.method === 'GET') {
    const saved = await deps.store.read(userId);
    return ok(saved ?? { profile: null });
  }

  if (request.method === 'DELETE') {
    await deps.store.remove(userId);
    return ok({ deleted: true });
  }

  if (request.method !== 'PUT')
    return failure(405, 'method_not_allowed', `${request.method} is not supported here`);

  const text = request.body ?? '';
  if (text.length > MAX_BODY_BYTES) return failure(413, 'too_large', 'That is too much to save.');
  let raw: unknown;
  try {
    raw = JSON.parse(text === '' ? '{}' : text);
  } catch {
    return failure(400, 'invalid_body', 'The request body is not valid JSON');
  }
  const profile = (raw as { profile?: unknown } | null)?.profile;
  if (typeof profile !== 'object' || profile === null || Array.isArray(profile))
    return failure(400, 'invalid_body', 'Send {"profile": {key: text}}', 'profile');
  const entries = Object.entries(profile);
  if (entries.length > MAX_KEYS) return failure(400, 'too_many', 'Too many items to save.');
  for (const [key, value] of entries) {
    if (!KEY.test(key)) return failure(400, 'bad_key', 'That setting cannot be saved.', key);
    if (typeof value !== 'string')
      return failure(400, 'bad_value', 'Every saved item is text.', key);
  }
  const saved = {
    profile: Object.fromEntries(entries) as Record<string, string>,
    updatedAt: deps.clock.now(),
  };
  await deps.store.write(userId, saved);
  return ok(saved);
}
