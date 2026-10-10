import type { RoomObservation, RoomVerdict } from '@vayu/contracts';
import { ageMinutes, makeProvenance } from './provenance';
import { roomVerdict } from './verdict';

/**
 * The verdict for a room as the API knows it. The app, the FixCheck workflow and anything else that
 * judges a room call this one function, so a screen and a workflow can never disagree. A reading
 * from a real unit is a measurement; anything simulated is labelled as a model.
 */
export function verdictForObservation(observation: RoomObservation): RoomVerdict {
  const insideAge =
    observation.insideObservedAt === null
      ? null
      : ageMinutes(observation.insideObservedAt, observation.asOf);
  const outsideAge =
    observation.outsideObservedAt === null
      ? null
      : ageMinutes(observation.outsideObservedAt, observation.asOf);
  const prov = makeProvenance({
    mode: observation.simulated ? 'model' : 'measured',
    source: 'unit',
    asOf: observation.asOf,
    simulated: observation.simulated,
    ...(observation.insideObservedAt === null ? {} : { observedAt: observation.insideObservedAt }),
  });
  return roomVerdict(
    {
      roomId: observation.roomId,
      asOf: observation.asOf,
      insidePm25: observation.insidePm25,
      insideAgeMinutes: insideAge,
      rhPct: observation.rhPct,
      outsidePm25: observation.outsidePm25,
      outsideAgeMinutes: outsideAge,
      lastSeenMinutes: observation.lastSeenMinutes,
    },
    prov,
  );
}
