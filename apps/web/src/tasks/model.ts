import { aqi24h, walkAdviceFor } from '@vayu/core';
import { bestHour, lensSeries } from '../lens/model';
import { hourName, hourOfDay, hourRange, isoDate } from '../today/time';
import type { TodayData } from '../today/types';

export type TaskKind =
  | 'walk'
  | 'stay-in'
  | 'windows'
  | 'mask'
  | 'purifier'
  | 'grap'
  /** A school's morning assembly: inside or on the ground. */
  | 'assembly'
  /** A GRAP stage's meaning at a school. */
  | 'school-grap'
  /** How a child's school day looks in the air. */
  | 'child';

export interface Task {
  readonly id: string;
  readonly kind: TaskKind;
  readonly title: string;
  readonly why: string;
  readonly points: number;
  /** The place a tip is for, when the day has more than one: a school as well as home. */
  readonly place?: string;
}

/** GRAP stage from the 24-hour CPCB AQI: I 201 to 300, II 301 to 400, III 401 to 450, IV above 450. 0 means none. */
export function grapStage(cpcbAqi: number | null): 0 | 1 | 2 | 3 | 4 {
  if (cpcbAqi === null || cpcbAqi <= 200) return 0;
  if (cpcbAqi <= 300) return 1;
  if (cpcbAqi <= 400) return 2;
  if (cpcbAqi <= 450) return 3;
  return 4;
}

const HOUR_MS = 3_600_000;

/** The most PM10 can be taken to exceed PM2.5 in Delhi's smog. One hour's ratio is applied to the day, so it is capped. */
const MAX_PM10_RATIO = 2;

/**
 * The 24-hour CPCB AQI of the last day, for the GRAP bands. It is only the hours that ended in the last 24 hours (a
 * monitor with gaps does not borrow older, cleaner hours), and CPCB's rule of at least sixteen valid hours holds: with
 * fewer, there is no figure and so no stage. Where the hour's PM10 is known, the day's PM10 is the day's PM2.5 scaled
 * by the ratio, kept between 1 and 2; where it is not, PM10 is taken to equal PM2.5, which can only understate the
 * index. So the figure never calls a stage the PM2.5 alone does not support, and it can fall short of the real one in a
 * dust event. Our estimate; the official order is the CAQM's.
 */
export function cpcbAqiFor(data: TodayData): number | null {
  const startMs = Date.parse(data.asOf) - 24 * HOUR_MS;
  const last24 = data.history
    .filter((h) => Date.parse(h.at) + HOUR_MS > startMs)
    .map((h) => h.pm25);
  if (data.pollutants.pm25 <= 0) return null;
  const measured =
    data.pollutants.pm10 === undefined ? 1 : data.pollutants.pm10 / data.pollutants.pm25;
  const ratio = Number.isFinite(measured) ? Math.min(MAX_PM10_RATIO, Math.max(1, measured)) : 1;
  return (
    aqi24h(
      last24,
      last24.map((v) => v * ratio),
    )?.aqi ?? null
  );
}

/**
 * The CPCB AQI this one hour would be if the whole day were like it: not a GRAP figure (GRAP follows the 24-hour
 * average) but the answer to "how bad is it right now, on India's scale". Null where there is nothing to say.
 */
export function cpcbAqiNow(data: TodayData): number | null {
  if (data.pollutants.pm25 <= 0) return null;
  const measured =
    data.pollutants.pm10 === undefined ? 1 : data.pollutants.pm10 / data.pollutants.pm25;
  const ratio = Number.isFinite(measured) ? Math.min(MAX_PM10_RATIO, Math.max(1, measured)) : 1;
  return aqi24h([data.pollutants.pm25], [data.pollutants.pm25 * ratio], 1)?.aqi ?? null;
}

/** The GRAP stage the last 24 hours point to, by our own estimate. Official orders always come first. */
export function grapStageFor(data: TodayData): 0 | 1 | 2 | 3 | 4 {
  return grapStage(cpcbAqiFor(data));
}

/** The stage this hour alone would be at, which can be well above `grapStageFor` when the air has just turned. */
export function grapStageNow(data: TodayData): 0 | 1 | 2 | 3 | 4 {
  return grapStage(cpcbAqiNow(data));
}

/** Points for each kind of task. */
export const POINTS: Readonly<Record<TaskKind, number>> = {
  walk: 30,
  'stay-in': 10,
  windows: 10,
  mask: 10,
  purifier: 10,
  grap: 15,
  assembly: 10,
  'school-grap': 15,
  child: 10,
};

const ROMAN = ['', 'I', 'II', 'III', 'IV'] as const;

/** "4–5 pm", and "tomorrow" when that hour is not on the same India day as `asOf`. */
const range = (at: string, asOf: string): string => {
  const day = isoDate(at) === isoDate(asOf) ? '' : ' tomorrow';
  return `${hourRange(Math.floor(hourOfDay(at)))}${day}`;
};

/**
 * Today's tasks: small things worth doing given the air, in plain words. A good hour for a walk, a stage
 * of GRAP, windows, a mask. At most four, and none that depend on a thing we have not measured.
 */
export function tasksFor(data: TodayData): readonly Task[] {
  const tasks: Task[] = [];
  const series = lensSeries(data);
  const best = bestHour(series);
  const now = data.aqi;

  // The cleanest daylight hour ahead is always named, with how long to stay out and where by how clean it is.
  // A GRAP stage from II up advises against walks and exercise outdoors, so the hour is for going out only if you must.
  const grap = grapStageFor(data);
  if (best !== undefined) {
    const advice = walkAdviceFor(best.aqi);
    const when = range(best.at, data.asOf);
    tasks.push({
      id: 'walk',
      kind: 'walk',
      title:
        grap >= 2
          ? `If you must go out, the cleanest hour: ${when}`
          : `${best.aqi <= 100 ? 'A good hour' : 'Cleanest hour'} for a walk: ${when}`,
      why:
        grap >= 3
          ? `The air here is in the GRAP Stage ${ROMAN[grap]} band, so avoid going out. If you must, AQI is ${String(best.aqi)} then; wear a well-fitted N95 and keep it short.`
          : grap === 2
            ? `The air here is in the GRAP Stage II band, so skip outdoor walks and exercise. If you must go out, AQI is ${String(best.aqi)} then; wear a well-fitted N95.`
            : `AQI ${String(best.aqi)}. ${advice.long}${grap === 1 ? ' The air here is in the GRAP Stage I band, so limit time outside.' : ''}`,
      points: POINTS.walk,
    });
  }

  if (now >= 101) {
    tasks.push({
      id: 'windows',
      kind: 'windows',
      title: 'Keep the windows shut',
      why: 'Outside air is worse than what is in your room.',
      points: POINTS.windows,
    });
  } else if (best !== undefined && best.aqi <= 100) {
    tasks.push({
      id: 'windows',
      kind: 'windows',
      title: `Air the room at ${hourName(Math.floor(hourOfDay(best.at)))}`,
      why: 'Ten minutes with the windows open, while the air is clean.',
      points: POINTS.windows,
    });
  }

  if (now >= 151) {
    tasks.push({
      id: 'mask',
      kind: 'mask',
      title: 'Wear a well-fitted N95 or FFP2 mask outside',
      why: 'A cloth or surgical mask does little against fine particles.',
      points: POINTS.mask,
    });
  }

  const stage = grap;
  if (stage > 0) {
    tasks.push({
      id: 'grap',
      kind: 'grap',
      title: `GRAP Stage ${ROMAN[stage]} may be in force`,
      why: 'Unofficial: our estimate, not an order. Read today’s official order at caqm.nic.in.',
      points: POINTS.grap,
    });
  }
  return tasks.slice(0, 4);
}
