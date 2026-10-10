import { describe, expect, it } from 'vitest';
import { FIXTURE_ROOM_AS_OF, fixtureRoomSource } from './fixtureRoomSource';

describe('fixtureRoomSource', () => {
  it('gives a fresh, plausible reading, always labelled as sample data', async () => {
    const input = await fixtureRoomSource().load('classroom-1');
    expect(input.roomId).toBe('classroom-1');
    expect(input.roomName).toBe('Sample classroom');
    expect(input.insidePm25).not.toBeNull();
    expect(input.outsidePm25).not.toBeNull();
    expect(input.simulated).toBe(true);
    expect(input.lastSeenMinutes).toBeLessThanOrEqual(2);
  });

  it('lets a test move the clock to see an older reading', async () => {
    const later = await fixtureRoomSource('2026-10-05T12:00:00.000Z').load('classroom-1');
    expect(later.lastSeenMinutes).toBeGreaterThan(2);
  });

  it('defaults to FIXTURE_ROOM_AS_OF when no clock is given', async () => {
    const input = await fixtureRoomSource().load('classroom-1');
    expect(input.asOf).toBe(FIXTURE_ROOM_AS_OF);
  });
});
