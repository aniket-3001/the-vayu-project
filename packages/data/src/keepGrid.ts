/**
 * Keeps what a slow-moving grid fetch gave, so many visitors cost the provider one round of requests. Within `keepMs`
 * the kept answer is returned; after a refusal the provider is not asked again for `retryMs`, so a busy minute does
 * not hammer a limit it has just hit; and when a refresh fails and an older answer is held, the older answer is
 * served rather than nothing, because wind and air models move slowly. With nothing held, the failure is thrown.
 */
export function keepGrid<T>(
  fetchAll: () => Promise<readonly T[]>,
  options: {
    readonly keepMs: number;
    readonly retryMs?: number;
    readonly now?: () => number;
  },
): () => Promise<readonly T[]> {
  const now = options.now ?? Date.now;
  const retryMs = options.retryMs ?? 10 * 60_000;
  let kept: { readonly at: number; readonly value: readonly T[] } | undefined;
  let failedAt: number | undefined;
  return async () => {
    if (kept !== undefined && now() - kept.at < options.keepMs) return kept.value;
    if (failedAt !== undefined && now() - failedAt < retryMs) {
      if (kept !== undefined) return kept.value;
      throw new Error('The provider refused a moment ago; not asking again yet');
    }
    try {
      const value = await fetchAll();
      kept = { at: now(), value };
      failedAt = undefined;
      return value;
    } catch (error) {
      failedAt = now();
      if (kept !== undefined) return kept.value;
      throw error;
    }
  };
}
