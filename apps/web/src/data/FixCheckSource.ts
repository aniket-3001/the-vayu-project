import { FixCheckResult } from '@vayu/contracts';
import { z } from 'zod';

/** Where "did it work?" runs are started and read. The app depends on this, not on the API. */
export interface FixCheckSource {
  start(roomId: string): Promise<{ readonly fixCheckId: string }>;
  read(fixCheckId: string): Promise<FixCheckResult>;
}

const Started = z.object({ fixCheckId: z.string() });
const ApiError = z.object({ error: z.object({ message: z.string() }) });

/** The deployed API's `/v1/fixchecks`. A refusal is shown in the API's own words. */
export function apiFixCheckSource(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): FixCheckSource {
  const root = baseUrl.replace(/\/$/, '');
  return {
    async start(roomId) {
      const res = await fetchImpl(`${root}/v1/fixchecks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        const parsed = ApiError.safeParse(body);
        throw new Error(
          parsed.success
            ? parsed.data.error.message
            : `Could not start the check: ${String(res.status)}`,
        );
      }
      return Started.parse(body);
    },
    async read(fixCheckId) {
      const res = await fetchImpl(`${root}/v1/fixchecks/${encodeURIComponent(fixCheckId)}`);
      if (!res.ok) throw new Error(`Could not read the check: ${String(res.status)}`);
      return FixCheckResult.parse(await res.json());
    },
  };
}
