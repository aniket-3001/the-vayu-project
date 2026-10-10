import { grapStageFor } from '../tasks/model';
import { levelForAqi } from '../design/levels';
import { weekday } from '../today/time';
import type { TodayData } from '../today/types';

export type AlertKind = 'grap' | 'smog' | 'walk' | 'stubble';

export interface Alert {
  readonly id: string;
  readonly kind: AlertKind;
  /** 0 is today, 1 tomorrow, 2 the day after. */
  readonly day: 0 | 1 | 2;
  readonly title: string;
  readonly body: string;
  /** Whether the alert comes with a way to reach the authorities. */
  readonly authorities: boolean;
}

/** Fires in the last 24 hours at which stubble burning counts as heavy. */
export const HEAVY_FIRES = 50;

const ROMAN = ['', 'I', 'II', 'III', 'IV'] as const;

/** "Today", "Tomorrow", or the weekday. */
export function dayWord(day: 0 | 1 | 2, data: TodayData): string {
  if (day === 0) return 'Today';
  if (day === 1) return 'Tomorrow';
  const at = data.daily[day]?.date ?? data.asOf;
  return weekday(at);
}

/**
 * Alerts for today and the next two days. They stay up while they apply, and when a day arrives its alerts are
 * today's, so they turn into suggestions in the tips. `fires` is the number our API counted in the last day.
 * Everything here is our estimate, never an order, and says so.
 */
export function alertsFor(data: TodayData, fires: number | undefined): readonly Alert[] {
  const alerts: Alert[] = [];
  const stage = grapStageFor(data);
  if (stage > 0) {
    alerts.push({
      id: 'grap-today',
      kind: 'grap',
      day: 0,
      title: `GRAP Stage ${ROMAN[stage]} likely today`,
      body: 'Unofficial: our estimate, not an order. Check the official order at caqm.nic.in.',
      authorities: false,
    });
  }
  if (data.aqi >= 151) {
    alerts.push({
      id: 'walk-today',
      kind: 'walk',
      day: 0,
      title: 'Avoid park walks today',
      body: `AQI ${String(data.aqi)}, ${levelForAqi(data.aqi).name.toLowerCase()}. Walk indoors if you can.`,
      authorities: false,
    });
  }
  data.daily.slice(1, 3).forEach((day, i) => {
    const offset = (i + 1) as 1 | 2;
    if (day.aqi >= 151 && day.aqi >= data.aqi + 20) {
      alerts.push({
        id: `smog-${String(offset)}`,
        kind: 'smog',
        day: offset,
        title: `Smog likely ${dayWord(offset, data).toLowerCase()}`,
        body: `AQI near ${String(day.aqi)}, ${levelForAqi(day.aqi).name.toLowerCase()}. Plan outdoor time before then.`,
        authorities: false,
      });
    }
  });
  if (fires !== undefined && fires >= HEAVY_FIRES) {
    alerts.push({
      id: 'stubble',
      kind: 'stubble',
      day: 1,
      title: 'Heavy stubble burning nearby',
      body: `${String(fires)} fires seen by satellite in the last 24 hours. Smoke can reach Delhi within a day or two.`,
      authorities: true,
    });
  }
  return alerts.sort((a, b) => a.day - b.day);
}

/** Alerts as they will read when `later` days have passed: tomorrow's become today's. */
export function onDay(alerts: readonly Alert[], later: 0 | 1 | 2): readonly Alert[] {
  return alerts
    .filter((a) => a.day >= later)
    .map((a) => ({ ...a, day: (a.day - later) as 0 | 1 | 2 }));
}

/** A suggestion for the day, from an alert that applies today. */
export function suggestionFrom(alert: Alert): string | undefined {
  if (alert.day !== 0) return undefined;
  switch (alert.kind) {
    case 'stubble':
      return 'Smoke from stubble burning is arriving: keep the windows shut and run a purifier.';
    case 'smog':
      return 'Smog is here today: keep outdoor time short.';
    default:
      return undefined;
  }
}
