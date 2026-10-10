import { Reading } from '@vayu/contracts';
import sampleReadingJson from '@vayu/contracts/fixtures/sample-reading.json';
import { ageMinutes } from '@vayu/core';
import type { RoomInput, RoomSource } from './RoomSource';

const SAMPLE_READING = Reading.parse(sampleReadingJson);

/**
 * One minute after the sample unit's one reading — inside rule.verdict's offlineAfterMin (2) and
 * maxInsideAgeMin (10), so the default demo view shows a real verdict, not "not sure".
 */
export const FIXTURE_ROOM_AS_OF = '2026-10-05T10:01:00.000Z';

/** A plausible outside reading the same morning — above minOutsidePm25 (100), so it's judgeable. */
const OUTSIDE_PM25 = 110;
const OUTSIDE_OBSERVED_AT = '2026-10-05T09:56:00.000Z';

/** A data source built from the one sample unit reading. Always labelled as sample data. */
export function fixtureRoomSource(asOf: string = FIXTURE_ROOM_AS_OF): RoomSource {
  return {
    load(roomId: string): Promise<RoomInput> {
      return Promise.resolve({
        roomId,
        roomName: 'Sample classroom',
        asOf,
        insidePm25: SAMPLE_READING.pm25,
        insideObservedAt: SAMPLE_READING.ts,
        rhPct: SAMPLE_READING.rhPct ?? null,
        outsidePm25: OUTSIDE_PM25,
        outsideObservedAt: OUTSIDE_OBSERVED_AT,
        lastSeenMinutes: ageMinutes(SAMPLE_READING.ts, asOf),
        simulated: true,
      });
    },
  };
}
