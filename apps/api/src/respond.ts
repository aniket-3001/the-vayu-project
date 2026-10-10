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
}

export const ok = (body: unknown): ApiResponse => ({ statusCode: 200, body });

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
