import type { ApiRequest } from './respond';

/** The admin emails from configuration (comma separated), lower-cased. Nothing set means nobody is an admin. */
export function parseAllowList(raw: string | undefined): readonly string[] {
  return (raw ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== '');
}

/**
 * Whether the signed-in person is an admin. The email comes only from the token API Gateway checked, and counts only
 * when the sign-in service says it is verified; it is never read from headers or the body.
 */
export function isAdmin(request: ApiRequest, allowList: readonly string[]): boolean {
  if (request.emailVerified !== true || request.email === undefined) return false;
  return allowList.includes(request.email.trim().toLowerCase());
}
