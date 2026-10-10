import type { CleanerSpec, RawHour, RoomSpec, SimEvent, SimResult } from '@vayu/contracts';
import { simulate, toMs } from '@vayu/core';
import type { ReplayWeek } from '../data/replayWeeks';
import type { LabelledSeries } from './simChart';

export interface SimulatorInput {
  readonly week: ReplayWeek;
  readonly room: RoomSpec;
  readonly cleaner: CleanerSpec;
  readonly unitCount: number;
  readonly events: readonly SimEvent[];
  readonly durationHours: number;
  /** Coarser than the room model's own 5-minute default, so a 72h window stays a few hundred points. */
  readonly stepMinutes?: number;
}

/** Re-runs `core.simulate` for the current controls — 05.2's own done-criterion, nothing cached. */
export function runSimulation(input: SimulatorInput): SimResult {
  return simulate({
    room: input.room,
    cleaners: input.unitCount > 0 ? [{ spec: input.cleaner, count: input.unitCount }] : [],
    outdoor: input.week.outdoor,
    events: input.events,
    startAt: input.week.startAt,
    durationHours: input.durationHours,
    ...(input.stepMinutes === undefined ? {} : { stepMinutes: input.stepMinutes }),
  });
}

/** Everything the chart shows, truncated to the replay clock (rule I1: never look ahead). */
export function chartSeries(
  result: SimResult,
  outdoor: readonly RawHour[],
  replayNowIso: string,
  measured: readonly { readonly ts: string; readonly value: number }[] = [],
): readonly LabelledSeries[] {
  const nowMs = toMs(replayNowIso);
  const notAfterNow = <T extends { ts: string }>(points: readonly T[]): readonly T[] =>
    points.filter((point) => toMs(point.ts) <= nowMs);

  return [
    {
      label: 'Historical',
      points: notAfterNow(outdoor.map((hour) => ({ ts: hour.hourStart, value: hour.pm25 ?? 0 }))),
    },
    {
      label: 'Model',
      points: notAfterNow(result.series.map((point) => ({ ts: point.ts, value: point.pm25 }))),
    },
    { label: 'Measured', points: notAfterNow(measured) },
  ];
}
