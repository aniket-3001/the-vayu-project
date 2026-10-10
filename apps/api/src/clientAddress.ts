/**
 * The caller's address, for the daily limits only (it is hashed, never kept). Behind CloudFront the connection is
 * CloudFront's, so the viewer's own address comes in the `CloudFront-Viewer-Address` header ("203.0.113.9:4430" or
 * "[2001:db8::1]:4430"). Without it, the address API Gateway saw is used. A caller who reaches the API without
 * CloudFront can write that header themselves and so dodge the per-caller limit; the limit for the whole day still
 * stands, and that is the one that bounds the cost.
 */
export function clientAddress(
  headers: Readonly<Record<string, string | undefined>>,
  connection: string,
): string {
  const viewer = headers['cloudfront-viewer-address'];
  if (viewer === undefined || viewer === '') return connection;
  const bracketed = /^\[([^\]]+)\]/u.exec(viewer);
  if (bracketed?.[1] !== undefined) return bracketed[1];
  return viewer.replace(/:\d+$/u, '');
}
