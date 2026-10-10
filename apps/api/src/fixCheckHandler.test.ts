import { describe, expect, it } from 'vitest';
import { StepEvent } from './fixCheckHandler';

const state = {
  fixCheckId: 'dev-1',
  roomId: 'dev',
  placeId: 'school',
  waitSeconds: 300,
  triesLeft: 3,
  baselinePm25: null,
};

describe('the FixCheck step event', () => {
  it.each(['baseline', 'verify', 'record'])('accepts the %s step', (step) => {
    expect(StepEvent.safeParse({ step, state }).success).toBe(true);
  });
  it('carries the last look’s outcome when there is one', () => {
    expect(
      StepEvent.safeParse({ step: 'record', state: { ...state, outcome: 'improved' } }).success,
    ).toBe(true);
  });
  it.each([
    ['an unknown step', { step: 'delete', state }],
    [
      'a room name that is not a plain name',
      { step: 'baseline', state: { ...state, roomId: 'a#b' } },
    ],
    ['no state', { step: 'baseline' }],
    ['a negative number of tries', { step: 'verify', state: { ...state, triesLeft: -1 } }],
    ['an outcome that does not exist', { step: 'record', state: { ...state, outcome: 'great' } }],
  ])('refuses %s', (_name, event) => {
    expect(StepEvent.safeParse(event).success).toBe(false);
  });
});
