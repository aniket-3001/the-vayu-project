export interface Group { n: number; p50: number; p95: number; max: number }
export function percentile(values: readonly number[], q: number): number;
export function summarise(samples: readonly { path: string; ms: number }[]): { first: Group; repeat: Group };
