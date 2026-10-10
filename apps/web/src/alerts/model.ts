import { cpcbAqiFor, grapStageFor } from '../tasks/model';
import { levelForAqi } from '../design/levels';
import { weekday } from '../today/time';
import type { TodayData } from '../today/types';

export type AlertKind = 'grap' | 'smog' | 'stubble';

/** How loud an alert is: a severe one glows red and comes first; the rest are cautions, in soft yellow. */
export type AlertSeverity = 'severe' | 'caution';

export interface Alert {
  readonly id: string;
  readonly kind: AlertKind;
  readonly severity: AlertSeverity;
  /** For a GRAP alert: the stage, 1 to 4, which sets its colour: yellow, orange, red, purple. */
  readonly stage?: 1 | 2 | 3 | 4;
  /** What to avoid, in plain words: walks, outdoor sport, open-ground school assembly. */
  readonly avoid: readonly string[];
  /** 0 is today, 1 tomorrow, 2 the day after. */
  readonly day: 0 | 1 | 2;
  readonly title: string;
  readonly body: string;
  /** One or two plain sentences on why this alert is up. */
  readonly reason: string;
  /** Two or three things to do about it. */
  readonly todo: readonly string[];
  /** Whether the alert comes with a way to reach the authorities. */
  readonly authorities: boolean;
}

/** Fires in the last 24 hours at which stubble burning counts as heavy. */
/** Fires near a place (within 100 km, or upwind within 300 km) that make a stubble alert. */
export const HEAVY_FIRES = 10;

const ROMAN = ['', 'I', 'II', 'III', 'IV'] as const;

/** What each GRAP stage means for a day out, in words: our reading of it, never an order. */
const GRAP_GUIDE: Readonly<
  Record<
    1 | 2 | 3 | 4,
    { readonly short: string; readonly avoid: readonly string[]; readonly todo: readonly string[] }
  >
> = {
  1: {
    short: 'Skip long outdoor walks and hard exercise. Keep school assembly short.',
    avoid: [
      'Long walks, runs and hard exercise outdoors, above all for children, older people and anyone with asthma.',
      'Long open-ground school assembly and outdoor sport: keep them short, or hold them under cover.',
      'Burning rubbish, leaves or wood.',
    ],
    todo: [
      'Do exercise indoors, or in the cleanest hour of the day.',
      'Keep the windows shut when the air is at its worst.',
    ],
  },
  2: {
    short: 'No outdoor walks or exercise. Hold school assembly inside.',
    avoid: [
      'Outdoor walks, runs and exercise for everyone, not only the sensitive.',
      'Open-ground school assembly and outdoor sport: hold them inside.',
      'Burning rubbish or wood for warmth, and running a diesel generator when there is another way.',
    ],
    todo: [
      'Move exercise indoors, and keep outdoor errands short.',
      'Wear a well-fitted N95 or FFP2 mask outside.',
      'Run a purifier if you have one.',
    ],
  },
  3: {
    short: 'Stay in where you can. No outdoor play, sport or open assembly.',
    avoid: [
      'Going out for anything that can wait.',
      'All outdoor play, exercise and sport, for adults and children.',
      'Open-ground school assembly and outdoor classes. Younger classes may be moved or paused by the authorities.',
      'Opening windows.',
    ],
    todo: [
      'Keep children and older people indoors.',
      'If you must go out, wear a well-fitted N95 or FFP2 mask.',
      'Run a purifier, and keep the windows shut.',
    ],
  },
  4: {
    short: 'Avoid going out. Schools may be shut or online: check the official order.',
    avoid: [
      'Leaving home unless it is necessary.',
      'Any outdoor activity, including school sport, play and assembly.',
      'Sending young children to school in person before you have read the official order: schools may be shut or moved online.',
      'Opening windows.',
    ],
    todo: [
      'Stay indoors, with the windows shut and a purifier on.',
      'If you must go out, wear a well-fitted N95 or FFP2 mask.',
      'Check on older neighbours and anyone with a lung or heart condition.',
    ],
  },
};

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
  if (stage !== 0) {
    const guide = GRAP_GUIDE[stage];
    alerts.push({
      id: 'grap-today',
      kind: 'grap',
      severity: stage >= 3 ? 'severe' : 'caution',
      stage,
      day: 0,
      title: `GRAP Stage ${ROMAN[stage]} likely today`,
      body: guide.short,
      reason: `The last 24 hours average about ${String(Math.round(cpcbAqiFor(data) ?? 0))} on India’s own scale (CPCB). That is in the band where GRAP Stage ${ROMAN[stage]} applies. This is our estimate, and only the official order counts.`,
      avoid: guide.avoid,
      todo: ['Read today’s official GRAP order at caqm.nic.in.', ...guide.todo],
      authorities: false,
    });
  }
  data.daily.slice(1, 3).forEach((day, i) => {
    const offset = (i + 1) as 1 | 2;
    if (day.aqi !== undefined && day.aqi >= 151 && day.aqi >= data.aqi + 20) {
      alerts.push({
        id: `smog-${String(offset)}`,
        kind: 'smog',
        severity: 'severe',
        day: offset,
        title: `Smog likely ${offset === 1 ? 'tomorrow' : dayWord(offset, data)}`,
        body: `AQI near ${String(day.aqi)}, ${levelForAqi(day.aqi).name.toLowerCase()}. Plan outdoor time before then.`,
        avoid: [
          'Long outdoor walks and exercise that day.',
          'Open-ground school assembly and outdoor sport.',
        ],
        reason: `Our forecast puts ${dayWord(offset, data).toLowerCase()}’s air near AQI ${String(day.aqi)}, ${String(day.aqi - data.aqi)} points worse than today’s ${String(data.aqi)}. It is a forecast, so it can change.`,
        todo: [
          'Do outdoor errands and exercise before then.',
          'Plan for windows shut and a purifier on.',
          'Check back; we update the forecast through the day.',
        ],
        authorities: false,
      });
    }
  });
  if (fires !== undefined && fires >= HEAVY_FIRES) {
    alerts.push({
      id: 'stubble',
      kind: 'stubble',
      severity: 'caution',
      day: 1,
      avoid: ['Opening windows when the smoke arrives.', 'Outdoor exercise on the mornings after.'],
      title: 'Heavy stubble burning nearby',
      body: `${String(fires)} fires seen by satellite in the last 24 hours, near here or upwind. Smoke can reach you within a day or two.`,
      reason: `Satellites saw ${String(fires)} fires in the last 24 hours within 100 km of this place, or within 300 km on the side the wind comes from. Fires further away, or downwind, are not counted. In October the wind often blows from the north-west.`,
      todo: [
        'Keep windows shut when the smoke arrives.',
        'Run a purifier, and wear an N95 outside.',
        'If you see burning near you, report it with a place, a time and a photo.',
      ],
      authorities: true,
    });
  }
  // The worst first, and within that today before tomorrow.
  const rank = (a: Alert): number => (a.severity === 'severe' ? 0 : 1);
  return alerts.sort((a, b) => rank(a) - rank(b) || a.day - b.day);
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
