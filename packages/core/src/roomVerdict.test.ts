import type { RoomObservation } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { verdictForObservation } from './roomVerdict';

const observation = (over: Partial<RoomObservation> = {}): RoomObservation => ({
  roomId: 'r',
  roomName: 'Room',
  asOf: '2026-10-08T10:00:00.000Z',
  insidePm25: 40,
  insideObservedAt: '2026-10-08T09:59:50.000Z',
  rhPct: 50,
  outsidePm25: 130,
  outsideObservedAt: '2026-10-08T09:00:00.000Z',
  lastSeenMinutes: 0,
  simulated: false,
  ...over,
});

describe('verdictForObservation', () => {
  it('judges a room from what the API knows, the same way whoever asks', () => {
    const v = verdictForObservation(observation());
    expect(v.verdict).toBe('working_well');
    expect(v.cleanerThanOutsidePct).toBeCloseTo(69.2, 1);
  });

  it('is a measurement when real and a model when simulated, and says so in its provenance', () => {
    expect(verdictForObservation(observation()).prov).toMatchObject({
      mode: 'measured',
      label: 'Your room',
    });
    expect(verdictForObservation(observation({ simulated: true })).prov).toMatchObject({
      mode: 'model',
      simulated: true,
    });
  });

  it('refuses to judge a unit that was never seen, and says why', () => {
    const v = verdictForObservation(
      observation({ insidePm25: null, insideObservedAt: null, lastSeenMinutes: null }),
    );
    expect(v.verdict).toBe('not_sure');
    expect(v.reasons).toContain('offline');
  });

  it('refuses when outside is too clean to judge, and when the air is damp', () => {
    expect(verdictForObservation(observation({ outsidePm25: 60 })).reasons).toContain(
      'too_clean_to_judge',
    );
    expect(verdictForObservation(observation({ rhPct: 88 })).reasons).toContain('damp_air');
  });
});
