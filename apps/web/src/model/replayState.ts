import { toIso, toMs } from '@vayu/core';

/**
 * A pause-and-resume-able replay clock, as a plain value rather than wall-clock-coupled state
 * (unlike `core.replayClock`, which has no pause). `elapsedSimMs` accumulates only while playing,
 * so pausing and resuming never jumps the clock.
 */
export interface ReplayState {
  readonly startAt: string;
  readonly endAt: string;
  readonly speed: number;
  readonly playing: boolean;
  readonly elapsedSimMs: number;
}

export function initialReplayState(startAt: string, endAt: string, speed = 3600): ReplayState {
  return { startAt, endAt, speed, playing: false, elapsedSimMs: 0 };
}

const durationMs = (state: ReplayState): number => toMs(state.endAt) - toMs(state.startAt);

/** The replay clock's current instant. Rule I1: never past `endAt`, the real data this is built from. */
export function replayNowIso(state: ReplayState): string {
  const clamped = Math.min(state.elapsedSimMs, durationMs(state));
  return toIso(toMs(state.startAt) + clamped);
}

export function play(state: ReplayState): ReplayState {
  return state.elapsedSimMs >= durationMs(state) ? state : { ...state, playing: true };
}

export function pause(state: ReplayState): ReplayState {
  return { ...state, playing: false };
}

export function setSpeed(state: ReplayState, speed: number): ReplayState {
  return { ...state, speed };
}

export function reset(state: ReplayState): ReplayState {
  return { ...state, playing: false, elapsedSimMs: 0 };
}

/** Advances the clock by one tick of real elapsed time, scaled by speed. A no-op while paused. */
export function tick(state: ReplayState, realMsElapsed: number): ReplayState {
  if (!state.playing) return state;
  const next = state.elapsedSimMs + realMsElapsed * state.speed;
  const clamped = Math.min(next, durationMs(state));
  return { ...state, elapsedSimMs: clamped, playing: clamped < durationMs(state) };
}

export const isFinished = (state: ReplayState): boolean => state.elapsedSimMs >= durationMs(state);
