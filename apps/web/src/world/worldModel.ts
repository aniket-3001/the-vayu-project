import type {
  CleanerSpec,
  RawHour,
  RoomSpec,
  SimEvent,
  SimPoint,
  SimResult,
} from '@vayu/contracts';
import { rules } from '@vayu/contracts';
import { simulate, toMs } from '@vayu/core';
import { OUR_UNIT } from '../data/simPresets';
import type { ScenarioRun } from './scenarios';

export type PurifierChoice = 'none' | 'ours' | 'ordinary';
export type WindowState = 'closed' | 'open';

export interface RoomSetup {
  readonly windows: WindowState;
  readonly purifier: PurifierChoice;
  /** How many of the purifier stand in the room. */
  readonly units: number;
}

/** Airflow of each purifier in m³/h. Both are assumptions the person can change; neither is measured. */
export interface Flows {
  readonly ours: number;
  readonly ordinary: number;
}

/**
 * What we assume until a test is run. Ours is the placeholder already used by the simulator; the
 * ordinary one is a typical home purifier. The screen says "assumed" next to both.
 */
export const DEFAULT_FLOWS: Flows = { ours: OUR_UNIT.cadrM3h.pm25, ordinary: 150 };

/** A classroom, 10 m by 7 m by 3.5 m: the room the blocks show. */
const CLASSROOM = { lengthM: 10, widthM: 7, heightM: 3.5 };

export function classroom(windows: WindowState): RoomSpec {
  return {
    id: `classroom-${windows}`,
    name: windows === 'open' ? 'Classroom, windows open' : 'Classroom, windows shut',
    ...CLASSROOM,
    airChangesPerHour: rules.room.airChangesPerHour[windows === 'open' ? 'windows_open' : 'closed'],
    leakiness: windows === 'open' ? 'windows_open' : 'closed',
    volumeM3: CLASSROOM.lengthM * CLASSROOM.widthM * CLASSROOM.heightM,
  };
}

const cleanerFor = (choice: 'ours' | 'ordinary', flows: Flows): CleanerSpec =>
  choice === 'ours'
    ? { ...OUR_UNIT, cadrM3h: { pm25: flows.ours, pm10: flows.ours * 1.1 } }
    : {
        id: 'ordinary',
        name: 'An ordinary purifier',
        layers: [],
        cadrM3h: { pm25: flows.ordinary, pm10: flows.ordinary * 1.1 },
        basis: 'assumed',
      };

/** One room for one day: the shared room model with this room's windows, purifiers and any puffs. */
export function runRoom(input: {
  readonly run: ScenarioRun;
  readonly setup: RoomSetup;
  readonly flows: Flows;
  readonly puffs: readonly SimEvent[];
}): SimResult {
  const { setup } = input;
  // Start in the lead-in hours, so by midnight the room has settled with its purifiers running.
  const lead = input.run.lead;
  const startAt = lead[0]?.hourStart ?? input.run.startAt;
  const day = toMs(input.run.startAt);
  const result = simulate({
    room: classroom(setup.windows),
    cleaners:
      setup.purifier === 'none' || setup.units <= 0
        ? []
        : [{ spec: cleanerFor(setup.purifier, input.flows), count: setup.units }],
    outdoor: [...lead, ...input.run.outdoor],
    events: input.puffs,
    startAt,
    durationHours: 24 + (day - toMs(startAt)) / 3_600_000,
    stepMinutes: 15,
  });
  const fromMidnight = (points: readonly SimPoint[]): SimPoint[] =>
    points.filter((point) => toMs(point.ts) >= day);
  return {
    ...result,
    series: fromMidnight(result.series),
    baseline: fromMidnight(result.baseline),
  };
}

export interface WorldFrame {
  readonly ts: string;
  readonly insidePm25: number;
  readonly outsidePm25: number;
  readonly lowerThanOutsidePct: number;
}

/** The step at or just before `atMs`, never a later one, clamped to the day. */
function pointAt(series: readonly SimPoint[], atMs: number): SimPoint | undefined {
  let found: SimPoint | undefined;
  for (const point of series) {
    if (toMs(point.ts) <= atMs) found = point;
    else break;
  }
  return found ?? series[0];
}

export function frameAt(result: SimResult, outdoor: readonly RawHour[], atMs: number): WorldFrame {
  const inside = pointAt(result.series, atMs);
  let outsideHour: RawHour | undefined;
  for (const hour of outdoor) {
    if (toMs(hour.hourStart) <= atMs) outsideHour = hour;
    else break;
  }
  const insidePm25 = inside?.pm25 ?? 0;
  const outsidePm25 = (outsideHour ?? outdoor[0])?.pm25 ?? 0;
  return {
    ts: inside?.ts ?? '',
    insidePm25,
    outsidePm25,
    lowerThanOutsidePct: outsidePm25 > 0 ? (1 - insidePm25 / outsidePm25) * 100 : 0,
  };
}

/** The most particles the scene draws in one room, so it stays smooth on a phone. */
export const MAX_PARTICLES = 260;

/** How many specks to draw for a concentration: about one per 2 µg/m³, capped. An illustration, not a count. */
export function particleCountFor(pm25: number): number {
  if (!Number.isFinite(pm25) || pm25 <= 0) return 0;
  return Math.min(MAX_PARTICLES, Math.round(pm25 / 2));
}

/** A plain sentence comparing two rooms at one moment. It says it is the model. */
export function compareRooms(a: number, b: number): string {
  const high = Math.max(a, b);
  const pct = high > 0 ? Math.round((1 - Math.min(a, b) / high) * 100) : 0;
  if (pct < 3) return 'In this model the two rooms are about the same.';
  return `In this model Room ${a < b ? 'A' : 'B'} has ${String(pct)}% less PM2.5 than Room ${a < b ? 'B' : 'A'} right now.`;
}
