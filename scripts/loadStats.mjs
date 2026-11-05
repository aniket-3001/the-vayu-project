// Latency summary for the load test, split into the first request for each address (nothing cached yet: this is what
// a person looking up a new place waits) and every later one (what the caches give). One combined p95 would only
// measure the first group, because a short test makes up to a tenth of its requests first looks.
export function percentile(values, q) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

/** `samples` are { path, ms } in the order they were sent. */
export function summarise(samples) {
  const seen = new Set();
  const first = [];
  const repeat = [];
  for (const { path, ms } of samples) {
    if (seen.has(path)) repeat.push(ms);
    else {
      seen.add(path);
      first.push(ms);
    }
  }
  return {
    first: {
      n: first.length,
      p50: percentile(first, 0.5),
      p95: percentile(first, 0.95),
      max: Math.max(0, ...first),
    },
    repeat: {
      n: repeat.length,
      p50: percentile(repeat, 0.5),
      p95: percentile(repeat, 0.95),
      max: Math.max(0, ...repeat),
    },
  };
}
