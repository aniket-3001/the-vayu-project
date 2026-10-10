import { z } from 'zod';

/** Satellite fire detections near Delhi. Detections, not a pollution reading. */
export interface FireSummary {
  readonly asOf: string;
  readonly last24h: number;
  readonly last72h: number;
  /** True when the numbers are sample data, so the screen can say so. */
  readonly simulated: boolean;
}

/** Where fire counts come from. The app depends on this interface, not on the API. */
export interface FireSource {
  load(): Promise<FireSummary>;
}

/** Sample counts for the demo. Always labelled as sample data. */
export function fixtureFireSource(asOf = '2026-10-05T12:00:00.000Z'): FireSource {
  return { load: () => Promise.resolve({ asOf, last24h: 1, last72h: 2, simulated: true }) };
}

const FiresResponse = z.object({
  asOf: z.string(),
  mode: z.enum(['live', 'replay', 'model', 'measured']),
  counts: z.object({
    last24h: z.number().int().nonnegative(),
    last72h: z.number().int().nonnegative(),
  }),
});

/** Fire counts from the deployed API's `/v1/fires`. Anything unexpected is an error, not a guess. */
export function apiFireSource(baseUrl: string, fetchImpl: typeof fetch = fetch): FireSource {
  return {
    async load() {
      const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/fires`);
      if (!res.ok) throw new Error(`Fire counts request failed: ${res.status}`);
      const body = FiresResponse.parse(await res.json());
      return {
        asOf: body.asOf,
        last24h: body.counts.last24h,
        last72h: body.counts.last72h,
        simulated: body.mode !== 'live',
      };
    },
  };
}
