import { toIso, toMs } from './time';

/** Everything that needs "now" takes a clock, so the app can run live or on a replayed week. */
export interface Clock {
  readonly mode: 'live' | 'replay';
  now(): string;
}

/** The real time. */
export function liveClock(wallClock: () => number = Date.now): Clock {
  return { mode: 'live', now: () => toIso(wallClock()) };
}

/** A clock that starts at `startIso` and runs `speed` times faster than real time. */
export function replayClock(
  startIso: string,
  speed = 1,
  wallClock: () => number = Date.now,
): Clock {
  const start = toMs(startIso);
  const wallStart = wallClock();
  return { mode: 'replay', now: () => toIso(start + (wallClock() - wallStart) * speed) };
}

/** A clock frozen at one instant. Used by tests and by the "stats for nerds" drawer. */
export function fixedClock(iso: string, mode: Clock['mode'] = 'replay'): Clock {
  return { mode, now: () => iso };
}
