import type { RawHour } from '@vayu/contracts';
import { concentrationForAqi } from '@vayu/core';
import type { ReplayWeek } from '../data/replayWeeks';

/** The world plays one day. */
export const WORLD_HOURS = 24;

/** Hours of air before the day begins, so the day opens with the rooms already settled. */
export const LEAD_HOURS = 6;

export interface ScenarioRun {
  /** Start of the day, ISO. */
  readonly startAt: string;
  /** The hours just before the day, oldest first, ending an hour before `startAt` ends the lead. */
  readonly lead: readonly RawHour[];
  /** Hourly outdoor air for the day and the hour after it (so the last step has air to use). */
  readonly outdoor: readonly RawHour[];
}

export interface Scenario {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  /** `real` is a measured week; `assumed` is a made-up day at a chosen level. Always shown. */
  readonly basis: 'real' | 'assumed';
  build(): ScenarioRun;
}

/** Midnight at the start of 12 December 2025, India time. The date does not matter; the hours do. */
const DAY_START = '2025-12-11T18:30:00.000Z';
const HOUR_MS = 3_600_000;

/**
 * How the air through a Delhi day compares with its daily mean, by India-time hour: cleaner in the
 * afternoon when the air mixes up, worse at night when it settles. Normalised so the mean is 1.
 */
const SHAPE = [
  1.25, 1.25, 1.2, 1.15, 1.1, 1.05, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.72, 0.7, 0.72, 0.78, 0.85,
  0.95, 1.05, 1.15, 1.25, 1.3, 1.3, 1.28,
] as const;
const SHAPE_MEAN = SHAPE.reduce((sum, v) => sum + v, 0) / SHAPE.length;

function atLevel(dailyMeanPm25: number): ScenarioRun {
  const start = Date.parse(DAY_START);
  const outdoor: RawHour[] = Array.from({ length: WORLD_HOURS + 1 }, (_, hour) => {
    const pm25 = (dailyMeanPm25 * (SHAPE[hour % 24] ?? 1)) / SHAPE_MEAN;
    return {
      hourStart: new Date(start + hour * HOUR_MS).toISOString(),
      pm25: Math.round(pm25 * 10) / 10,
      // Coarse dust runs about 1.6 times the fine particles in winter Delhi. An assumption, said so.
      pm10: Math.round(pm25 * 1.6 * 10) / 10,
    };
  });
  // The six hours before midnight are the last six hours of the same kind of day.
  const lead: RawHour[] = Array.from({ length: LEAD_HOURS }, (_, i) => {
    const hour = 24 - LEAD_HOURS + i;
    const pm25 = (dailyMeanPm25 * (SHAPE[hour] ?? 1)) / SHAPE_MEAN;
    return {
      hourStart: new Date(start - (LEAD_HOURS - i) * HOUR_MS).toISOString(),
      pm25: Math.round(pm25 * 10) / 10,
      pm10: Math.round(pm25 * 1.6 * 10) / 10,
    };
  });
  return { startAt: DAY_START, lead, outdoor };
}

const synthetic = (id: string, title: string, blurb: string, dailyMeanPm25: number): Scenario => ({
  id,
  title,
  blurb,
  basis: 'assumed',
  build: () => atLevel(dailyMeanPm25),
});

/** The PM2.5 on India's scale at which the Commission orders GRAP Stage IV: AQI 450. */
const STAGE_IV_PM25 = concentrationForAqi('pm25', 450);

export const SYNTHETIC_SCENARIOS: readonly Scenario[] = [
  synthetic(
    'cleaner-day',
    'A cleaner day',
    'A made-up day with a daily average of 40 µg/m³ PM2.5: about as good as winter gets.',
    40,
  ),
  synthetic(
    'smoggy-day',
    'A smoggy day',
    'A made-up day with a daily average of 150 µg/m³ PM2.5: a bad but ordinary Delhi winter day.',
    150,
  ),
  synthetic(
    'very-bad-day',
    'A very bad day',
    'A made-up day with a daily average of 250 µg/m³ PM2.5: the start of the "severe" band.',
    250,
  ),
  synthetic(
    'grap4',
    'The level where Stage IV is ordered',
    `A made-up day at ${String(Math.round(STAGE_IV_PM25))} µg/m³ PM2.5, which is AQI 450 on India's scale, the level at which GRAP Stage IV is ordered. This shows the air only; the official measures are in Watch.`,
    STAGE_IV_PM25,
  ),
];

/** The 24 hours of a real week with the highest average PM2.5: the real bad day. */
export function realWeekScenario(week: ReplayWeek): Scenario {
  return {
    id: 'real-week',
    title: 'The worst real day of the week',
    blurb: `The worst 24 hours of ${week.label}, measured at ${week.real?.stationName ?? 'a Delhi station'}. Real station data, not made up.`,
    basis: 'real',
    build() {
      const hours = week.outdoor;
      let bestStart = 0;
      let bestMean = -Infinity;
      for (let start = 0; start + WORLD_HOURS < hours.length; start++) {
        const window = hours.slice(start, start + WORLD_HOURS);
        const values = window.flatMap((h) => (h.pm25 === null ? [] : [h.pm25]));
        if (values.length < WORLD_HOURS * 0.75) continue;
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        if (mean > bestMean) {
          bestMean = mean;
          bestStart = start;
        }
      }
      const picked = hours.slice(bestStart, bestStart + WORLD_HOURS + 1);
      // The real hours just before the day, when there are that many; where the week begins there
      // are fewer, and the lead is simply shorter (the room then settles from the first hour).
      const lead = hours.slice(Math.max(0, bestStart - LEAD_HOURS), bestStart);
      return { startAt: picked[0]?.hourStart ?? week.startAt, lead, outdoor: picked };
    },
  };
}
