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

/** The 24-hour CPCB AQI the last day points to, for the GRAP bands. Our estimate, from PM2.5 and a PM10 scaled from it. */
export function cpcbAqiFor(data: TodayData): number | null {
  const last24 = data.history.slice(-24).map((h) => h.pm25);
  // The 24-hour CPCB figure needs PM10 too. Without the model's PM10 we cannot work it out, so we say nothing.
  if (data.pollutants.pm10 === undefined || data.pollutants.pm25 <= 0) return null;
  const ratio = data.pollutants.pm10 / data.pollutants.pm25;
  // Delhi's PM10 is about one to three times its PM2.5, and up to five in a dust storm. A model value far outside that is a fault or a dust
  // plume, and an alert built on it would be a guess, so we say nothing.
  if (ratio < 1 || ratio > 5) return null;
  const pm10 = last24.map((v) => v * ratio);
  return aqi24h(last24, pm10)?.aqi ?? null;
}

/** The GRAP stage the last 24 hours point to, by our own estimate. Official orders always come first. */
export function grapStageFor(data: TodayData): 0 | 1 | 2 | 3 | 4 {
  return grapStage(cpcbAqiFor(data));
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
          ? `GRAP Stage ${ROMAN[grap]} is likely, so avoid going out. If you must, AQI is ${String(best.aqi)} then; wear a well-fitted N95 and keep it short.`
          : grap === 2
            ? `GRAP Stage II is likely, so skip outdoor walks and exercise. If you must go out, AQI is ${String(best.aqi)} then; wear a well-fitted N95.`
            : `AQI ${String(best.aqi)}. ${advice.long}${grap === 1 ? ' GRAP Stage I is likely, so limit time outside.' : ''}`,
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
