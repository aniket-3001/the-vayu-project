/** Small numeric helpers shared by the modules. Pure. */

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('mean of an empty list');
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/** Groups items by a key, keeping insertion order. */
export function groupBy<Item, Key>(
  items: readonly Item[],
  keyOf: (item: Item) => Key,
): ReadonlyMap<Key, readonly Item[]> {
  const groups = new Map<Key, Item[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/** A seeded pseudo-random generator, so tests and fixtures are repeatable. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** The middle value (the mean of the two middle values for an even count). Throws on an empty list. */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('median of nothing');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
