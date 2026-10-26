import type { Clock } from '@vayu/core';
import { isAdmin } from './adminGuard';
import { DIMENSIONS, type Dimension } from './analyticsModel';
import type { AnalyticsStore } from './analyticsStore';
import { failure, ok, type ApiRequest, type ApiResponse } from './respond';

export interface AdminDeps {
  readonly store: AnalyticsStore;
  readonly clock: Clock;
  readonly admins: readonly string[];
}

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;
const USER_PREFIX = '/v1/admin/users/';

const daysOf = (raw: string | undefined): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_DAYS) : DEFAULT_DAYS;
};

/**
 * `GET /v1/admin/*`: usage statistics for the two owners. API Gateway has checked the sign-in; this decides whether
 * the person is an admin, before it looks at the path or touches any data. Everyone else gets a plain refusal.
 */
export async function handleAdmin(request: ApiRequest, deps: AdminDeps): Promise<ApiResponse> {
  if (request.userId === undefined || request.userId === '')
    return failure(401, 'sign_in_needed', 'Sign in first.');
  if (!isAdmin(request, deps.admins)) return failure(403, 'forbidden', 'Not allowed.');
  if (request.method !== 'GET')
    return failure(405, 'method_not_allowed', `${request.method} is not supported here`);

  const now = deps.clock.now();
  const days = daysOf(request.query.days);
  const path = request.path;

  if (path === '/v1/admin/whoami') return ok({ admin: true });
  if (path === '/v1/admin/summary') return ok({ days: await deps.store.summary(days, now) });
  if (path === '/v1/admin/groups') {
    const by = request.query.by;
    if (!(DIMENSIONS as readonly (string | undefined)[]).includes(by) || by === 'all')
      return failure(400, 'bad_group', 'Group by platform, version, region, auth or visitor.', 'by');
    return ok({ by, rows: await deps.store.groups(by as Dimension, days, now) });
  }
  if (path === '/v1/admin/users') return ok({ users: await deps.store.accounts(500) });
  if (path.startsWith(USER_PREFIX)) {
    const id = decodeURIComponent(path.slice(USER_PREFIX.length));
    const found = await deps.store.account(id, 200);
    return found === undefined
      ? failure(404, 'not_found', 'No such account.')
      : ok({ user: found.row, events: found.events });
  }
  if (path === '/v1/admin/errors') return ok({ errors: await deps.store.errors(50, now) });
  return failure(404, 'not_found', `No route ${path}`);
}
