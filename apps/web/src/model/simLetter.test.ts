import { describe, expect, it } from 'vitest';
import { REPLAY_WEEKS } from '../data/replayWeeks';
import { OUR_UNIT, ROOM_PRESETS } from '../data/simPresets';
import { buildLetter, buildRoomCard } from './simLetter';
import { runSimulation } from './simulatorModel';

const week = REPLAY_WEEKS[0];
const room = ROOM_PRESETS[0];
if (week === undefined || room === undefined) {
  throw new Error('expected at least one replay week and one room preset');
}

describe('buildRoomCard and buildLetter (05.4)', () => {
  it('reads the units-needed and band-change figures straight from core.simulate', () => {
    const result = runSimulation({
      week,
      room,
      cleaner: OUR_UNIT,
      unitCount: 1,
      events: [],
      durationHours: 24,
    });
    const card = buildRoomCard(room, result);
    expect(card.unitsNeeded).toBe(result.summary.unitsNeeded);
    expect(card.roomName).toBe(room.name);
  });

  it('says "model estimate" in the letter', () => {
    const result = runSimulation({
      week,
      room,
      cleaner: OUR_UNIT,
      unitCount: 1,
      events: [],
      durationHours: 24,
    });
    const letter = buildLetter(buildRoomCard(room, result));
    expect(letter).toMatch(/model estimate/);
  });

  it('never claims it as a guarantee or a measurement', () => {
    const result = runSimulation({
      week,
      room,
      cleaner: OUR_UNIT,
      unitCount: 1,
      events: [],
      durationHours: 24,
    });
    const letter = buildLetter(buildRoomCard(room, result));
    expect(letter).toMatch(/not a guarantee/);
    expect(letter).toMatch(/not a measurement/);
  });
});
