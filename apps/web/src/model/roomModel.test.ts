import { describe, expect, it } from 'vitest';
import { fixtureRoomSource } from '../data/fixtureRoomSource';
import { buildRoomModel } from './roomModel';

describe('buildRoomModel', () => {
  it('calls the unit "Your room" and shows how old its reading is', async () => {
    const input = await fixtureRoomSource().load('classroom-1');
    const model = buildRoomModel(input);
    expect(model.insideProv).not.toBeNull();
    expect(model.insideProv?.label).toBe('Your room');
    expect(model.insideProv?.ageMinutes).toBeLessThanOrEqual(2);
  });

  it('says working well when the room is clearly cleaner than outside', async () => {
    const input = await fixtureRoomSource().load('classroom-1');
    const model = buildRoomModel(input);
    expect(model.verdict.verdict).toBe('working_well');
    expect(model.verdict.cleanerThanOutsidePct).not.toBeNull();
    expect(model.verdict.reasons).toHaveLength(0);
  });

  it('is not sure, and says why, once the unit has gone quiet', async () => {
    const input = await fixtureRoomSource('2026-10-05T12:00:00.000Z').load('classroom-1');
    const model = buildRoomModel(input);
    expect(model.verdict.verdict).toBe('not_sure');
    expect(model.verdict.reasons).toContain('offline');
  });

  it('has no inside provenance when there is no reading at all', () => {
    const model = buildRoomModel({
      roomId: 'empty-room',
      roomName: 'Empty room',
      asOf: '2026-10-05T10:00:00.000Z',
      insidePm25: null,
      insideObservedAt: null,
      rhPct: null,
      outsidePm25: 110,
      outsideObservedAt: '2026-10-05T09:56:00.000Z',
      lastSeenMinutes: null,
      simulated: true,
    });
    expect(model.insideProv).toBeNull();
    expect(model.verdict.verdict).toBe('not_sure');
    expect(model.verdict.reasons).toContain('no_inside_reading');
  });

  it('calls a reading from a real unit a measurement, and a simulated one a model', () => {
    const input = {
      roomId: 'r',
      roomName: 'Room',
      asOf: '2026-10-08T10:00:00.000Z',
      insidePm25: 40,
      insideObservedAt: '2026-10-08T09:59:50.000Z',
      rhPct: 50,
      outsidePm25: 130,
      outsideObservedAt: '2026-10-08T09:00:00.000Z',
      lastSeenMinutes: 0,
    };
    expect(buildRoomModel({ ...input, simulated: false }).verdict.prov.mode).toBe('measured');
    expect(buildRoomModel({ ...input, simulated: true }).verdict.prov.mode).toBe('model');
  });
});
