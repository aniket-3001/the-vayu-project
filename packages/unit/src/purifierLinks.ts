export const PURIFIER_LINKS_KEY = 'vayu.purifiers.v1';

function load(storage: Storage): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(PURIFIER_LINKS_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

/** The name the person gave the purifier whose tag has this short id, if they have. */
export function purifierName(storage: Storage, tag: number): string | undefined {
  const name = load(storage)[String(tag)];
  return typeof name === 'string' && name !== '' ? name : undefined;
}

/** Remembers which purifier a tag belongs to, on this device. An empty name is ignored. */
export function linkPurifier(storage: Storage, tag: number, name: string): void {
  const trimmed = name.trim();
  if (trimmed === '') return;
  try {
    storage.setItem(
      PURIFIER_LINKS_KEY,
      JSON.stringify({ ...load(storage), [String(tag)]: trimmed }),
    );
  } catch {
    // Best effort: asked again next time.
  }
}
