import { ReplayManifest, Timeline, type RawHour } from '@vayu/contracts';
import { z } from 'zod';
import { REPLAY_WEEKS, type ReplayWeek } from './replayWeeks';

/** Where the simulator's replay week comes from. The app depends on this, not on the API. */
export interface ReplaySource {
  /** The week to replay, or undefined when none has been prepared. */
  load(): Promise<ReplayWeek | undefined>;
}

/** The synthetic sample week. Always labelled as sample data. */
export function fixtureReplaySource(): ReplaySource {
  return { load: () => Promise.resolve(REPLAY_WEEKS[0]) };
}

const WeeksResponse = z.object({ weeks: z.array(ReplayManifest) });

/** School is where the free-trial story lives, and its station is close to the demo classroom. */
const REPLAY_PLACE = 'school';

/**
 * A real past week from the deployed API. The week is asked for at its own end, so the API's
 * "hours that had ended by then" are exactly the week. The API enforces that nothing later than
 * the asked instant is returned; the chart then reveals the week as the replay clock moves.
 */
export function apiReplaySource(baseUrl: string, fetchImpl: typeof fetch = fetch): ReplaySource {
  const root = baseUrl.replace(/\/$/, '');
  const get = async (path: string): Promise<unknown> => {
    const res = await fetchImpl(`${root}${path}`);
    if (!res.ok) throw new Error(`Replay request failed: ${res.status}`);
    return res.json();
  };
  return {
    async load() {
      const { weeks } = WeeksResponse.parse(await get('/v1/replay/weeks'));
      const manifest = weeks[0];
      if (manifest === undefined) return undefined;

      const timeline = Timeline.parse(
        await get(
          `/v1/replay?week=${encodeURIComponent(manifest.weekId)}&place=${REPLAY_PLACE}` +
            `&asOf=${encodeURIComponent(manifest.end)}`,
        ),
      );
      const outdoor: RawHour[] = timeline.hours
        .filter((hour) => hour.kind === 'observed' && hour.pm25 !== null)
        .map((hour) => ({ hourStart: hour.hourStart, pm25: hour.pm25, pm10: hour.pm10 }));
      const { stationName, distanceKm } = timeline.prov;
      return {
        id: manifest.weekId,
        label: manifest.title,
        startAt: manifest.start,
        endAt: manifest.end,
        outdoor,
        ...(stationName === undefined || distanceKm === undefined
          ? {}
          : { real: { stationName, distanceKm } }),
      };
    },
  };
}
