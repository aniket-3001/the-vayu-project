export interface ApiRequest {
  readonly method: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body?: string;
}

export interface ApiResponse {
  readonly statusCode: number;
  readonly body: unknown;
  /** Extra response headers. Today only `cache-control`, so shared caches can keep an answer for a few minutes. */
  readonly headers?: Readonly<Record<string, string>>;
}

export const ok = (body: unknown): ApiResponse => ({ statusCode: 200, body });

/** An answer that is the same for everyone and moves slowly: browsers and CloudFront may keep it for `seconds`. */
export const okCached = (body: unknown, seconds: number): ApiResponse => ({
  statusCode: 200,
  body,
  headers: { 'cache-control': `public, max-age=${String(seconds)}` },
});

/** Errors always have the same shape: a stable code to branch on and a message for a person. */
export const failure = (
  statusCode: number,
  code: string,
  message: string,
  param?: string,
): ApiResponse => ({
  statusCode,
  body: { error: { code, message, ...(param === undefined ? {} : { param }) } },
});
