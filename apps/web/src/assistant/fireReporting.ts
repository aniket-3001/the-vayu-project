import type { Pin } from '../data/pins';
import { pinForRole, roleOfLabel } from '../places/roles';

/** A report of a fire being put together in the chat: where it is, and then anything to add. */
export interface FireDraft {
  readonly where?: { readonly lat: number; readonly lng: number; readonly label: string };
  /** Set once the place is known and the person has been asked for a line to add. */
  readonly asked?: 'note';
}

/**
 * Whether someone is telling us about a fire, rather than asking about the fires on the map: "report a fire",
 * "I can see stubble burning near my school", "there is a fire in the field behind home".
 */
export function isFireReport(text: string): boolean {
  const t = text.toLowerCase();
  if (!/\b(fire|fires|burning|burn|burnt|stubble|smoke|smoking)\b/u.test(t)) return false;
  if (/\b(report|reporting|flag|alert)\b/u.test(t)) return true;
  if (/\?\s*$/u.test(t)) return false;
  return (
    /\b(i|we)\b[^.]*\b(see|saw|seen|spot|spotted|notice|noticed|smell|smelt|can see|am seeing)\b/u.test(
      t,
    ) ||
    /\bthere('s| is| are)\b[^.]*\b(fire|burning|stubble|smoke)\b/u.test(t) ||
    /\b(someone|they|farmers?|neighbours?) (is|are)\b[^.]*\b(burning|fire)\b/u.test(t)
  );
}

/** Whether a reply means "that is all, send it". */
export const isSendIt = (text: string): boolean =>
  /^(send( it)?|send the report|no|nope|nothing|nothing else|skip|that'?s all|that is all|go ahead|ok(ay)?|yes|done)\b/iu.test(
    text.trim(),
  );

/** Where the person says the fire is: where they are, or one of their places. Undefined when they have not said. */
export function placeFromText(
  text: string,
  pins: readonly Pin[],
): 'here' | { readonly lat: number; readonly lng: number; readonly label: string } | undefined {
  const t = text.toLowerCase();
  const byName = pins.find((p) => p.name.length > 1 && t.includes(p.name.toLowerCase()));
  if (byName !== undefined) return { lat: byName.lat, lng: byName.lng, label: byName.name };
  for (const [words, role] of [
    [/\bhome|house|flat\b/u, 'home'],
    [/\bschool|college|campus\b/u, 'school'],
    [/\bwork|office\b/u, 'work'],
    [/\bpark|garden|playground\b/u, 'outdoor'],
  ] as const) {
    if (!words.test(t)) continue;
    const pin = pinForRole(role, pins);
    if (pin !== undefined) return { lat: pin.lat, lng: pin.lng, label: pin.name };
  }
  if (/\b(near me|here|where i am|around me|my location|outside my|next to me|close by)\b/u.test(t))
    return 'here';
  return undefined;
}

export { roleOfLabel };
