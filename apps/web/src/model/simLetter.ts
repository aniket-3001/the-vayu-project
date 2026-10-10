import type { RoomSpec, SimResult } from '@vayu/contracts';
import { usStyleFor } from '../design/bands';

export interface RoomCard {
  readonly roomName: string;
  readonly volumeM3: number;
  readonly bandBefore: string;
  readonly bandAfter: string;
  readonly lowerPct: number;
  readonly unitsNeeded: number;
}

function usLabel(pm25: number): string {
  const us = usStyleFor(pm25);
  return us === undefined ? 'unknown' : `US AQI ${us.value} (${us.category})`;
}

export function buildRoomCard(room: RoomSpec, result: SimResult): RoomCard {
  return {
    roomName: room.name,
    volumeM3: room.volumeM3,
    bandBefore: usLabel(result.summary.steadyPm25NoCleaner),
    bandAfter: usLabel(result.summary.steadyPm25),
    lowerPct: Math.round(result.summary.lowerPct),
    unitsNeeded: result.summary.unitsNeeded,
  };
}

/**
 * A template letter for "ask for a free trial in this room" — no store, no payments, just a
 * request a person can send on. Always says "model estimate": this is `core.simulate`'s output,
 * not a measurement (05.4's own done-criterion).
 */
export function buildLetter(card: RoomCard): string {
  return [
    `Request: a free trial air cleaner for ${card.roomName}`,
    '',
    `Based on a model estimate (not a measurement) for a room of about ${Math.round(card.volumeM3)} m³, ` +
      `the air here is typically "${card.bandBefore}". Our model estimate suggests that running ` +
      `${card.unitsNeeded} unit${card.unitsNeeded === 1 ? '' : 's'} could bring it to about ` +
      `"${card.bandAfter}" — roughly ${card.lowerPct}% lower than without a cleaner.`,
    '',
    'This is a model estimate, not a guarantee. We would like to run a short trial in this room ' +
      'to check it against a real measurement before anyone relies on it.',
  ].join('\n');
}
