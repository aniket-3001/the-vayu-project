import { isoDate } from './today/time';

/** An India calendar date, "2026-10-10". */
export type DateKey = string;

let source: () => string = () => new Date().toISOString();

/**
 * The one place the app asks what time it is. The deployed app uses the real clock. The prototype build and the
 * tests set it to a fixed moment, so a made-up day stays the same day. Nothing else in the app calls `Date`.
 */
export function setClock(now: () => string): void {
  source = now;
}

/** The current instant, ISO. */
export const nowIso = (): string => source();

/** Today's India calendar date. */
export const todayKey = (): DateKey => isoDate(nowIso());
