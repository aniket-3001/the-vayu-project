/** How long one call to an outside provider may take before we stop waiting for it. */
export const PROVIDER_TIMEOUT_MS = 4000;

/**
 * `fetch` that gives up after `ms`. The global `fetch` waits forever, so one provider that accepts a connection and
 * then says nothing held a whole request until the function's own limit killed it (found on the live stack: some
 * `/v1/today` calls ran the full 10 seconds and failed). With a limit, the call fails fast and each repo's existing
 * handling applies: weather and gases are left out, a missing monitor falls back to the regional model.
 * A signal the caller passes still works; whichever fires first wins.
 */
export function timedFetch(
  ms: number = PROVIDER_TIMEOUT_MS,
  base: typeof fetch = fetch,
): typeof fetch {
  return (input, init) => {
    const limit = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, limit]) : limit;
    return base(input, { ...init, signal });
  };
}
