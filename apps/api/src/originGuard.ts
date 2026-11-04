import { timingSafeEqual } from 'node:crypto';

/** The header CloudFront adds to every request it forwards to the API. */
export const ORIGIN_HEADER = 'x-origin-verify';

/** Paths that do not come through CloudFront and carry their own secret instead (Telegram's servers call this one). */
const OWN_SECRET_PATHS: ReadonlySet<string> = new Set(['/v1/watch/telegram/webhook']);

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Whether a request may go on. CloudFront adds a secret header that only it and this function know, so a caller who
 * reaches API Gateway's public address directly cannot forge `CloudFront-Viewer-Address` to dodge the per-caller
 * limits. With no `expected` secret (local runs, or not yet switched on at deploy time) every request is allowed.
 */
export function originAllowed(
  path: string,
  headers: Readonly<Record<string, string | undefined>>,
  expected: string | undefined,
): boolean {
  if (expected === undefined || expected === '') return true;
  if (OWN_SECRET_PATHS.has(path)) return true;
  const given = headers[ORIGIN_HEADER];
  return given !== undefined && sameSecret(given, expected);
}
