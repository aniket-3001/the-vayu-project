import type { Provenance, RoomVerdict } from '@vayu/contracts';
import { verdictForObservation } from '@vayu/core';
import type { RoomInput } from '../data/RoomSource';

/** Everything the room page shows, already calculated. */
export interface RoomModel {
  readonly roomName: string;
  readonly verdict: RoomVerdict;
  /** Provenance for the inside reading itself — "Your room", with its own age (rule I2). Null when there's no reading at all. */
  readonly insideProv: Provenance | null;
}

/**
 * Turns room observations into what the screen shows. Pure: the same input always gives the same
 * model. The verdict comes from the shared core, so the page and the FixCheck workflow cannot
 * disagree about the same room.
 */
export function buildRoomModel(input: RoomInput): RoomModel {
  const verdict = verdictForObservation(input);
  return {
    roomName: input.roomName,
    verdict,
    insideProv: input.insidePm25 === null ? null : verdict.prov,
  };
}
