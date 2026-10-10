import { describe, expect, it } from 'vitest';
import {
  initialReplayState,
  isFinished,
  pause,
  play,
  replayNowIso,
  reset,
  setSpeed,
  tick,
} from './replayState';

const START = '2025-12-05T00:00:00.000Z';
const END = '2025-12-05T06:00:00.000Z'; // a 6-hour window, easy numbers

describe('replayState (05.1)', () => {
  it('starts paused, at the start instant', () => {
    const state = initialReplayState(START, END);
    expect(state.playing).toBe(false);
    expect(replayNowIso(state)).toBe(START);
  });

  it('does not advance while paused', () => {
    const state = initialReplayState(START, END);
    expect(replayNowIso(tick(state, 10_000))).toBe(START);
  });

  it('advances by realMs * speed once playing', () => {
    const state = play(initialReplayState(START, END, 3600)); // 1 real second = 1 sim hour
    const after = tick(state, 1000);
    expect(replayNowIso(after)).toBe('2025-12-05T01:00:00.000Z');
  });

  it('never shows a time past the end of the real data (rule I1)', () => {
    const state = play(initialReplayState(START, END, 3600));
    const after = tick(state, 100_000); // would be 100,000 sim hours past start
    expect(replayNowIso(after)).toBe(END);
    expect(toMsSafe(replayNowIso(after))).toBeLessThanOrEqual(toMsSafe(END));
  });

  it('stops playing by itself once it reaches the end', () => {
    const state = play(initialReplayState(START, END, 3600));
    const after = tick(state, 100_000);
    expect(after.playing).toBe(false);
    expect(isFinished(after)).toBe(true);
  });

  it('pausing keeps the elapsed time; resuming continues from there, not from zero', () => {
    let state = play(initialReplayState(START, END, 3600));
    state = tick(state, 1000); // +1h
    state = pause(state);
    state = tick(state, 5000); // paused: no change
    expect(replayNowIso(state)).toBe('2025-12-05T01:00:00.000Z');
    state = play(state);
    state = tick(state, 1000); // +1h more
    expect(replayNowIso(state)).toBe('2025-12-05T02:00:00.000Z');
  });

  it('will not resume play once already finished', () => {
    let state = play(initialReplayState(START, END, 3600));
    state = tick(state, 100_000);
    state = pause(state);
    state = play(state);
    expect(state.playing).toBe(false);
  });

  it('changes speed without changing the current instant', () => {
    let state = play(initialReplayState(START, END, 3600));
    state = tick(state, 1000);
    const before = replayNowIso(state);
    state = setSpeed(state, 7200);
    expect(replayNowIso(state)).toBe(before);
  });

  it('resets back to the start, paused', () => {
    let state = play(initialReplayState(START, END, 3600));
    state = tick(state, 1000);
    state = reset(state);
    expect(state.playing).toBe(false);
    expect(replayNowIso(state)).toBe(START);
  });
});

function toMsSafe(iso: string): number {
  return new Date(iso).getTime();
}
