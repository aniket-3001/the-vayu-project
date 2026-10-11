import type { Alert } from '../alerts/model';
import { alertTitleHindi } from '../alerts/hindi';
import type { Person } from '../exposure/people';
import { bestHour, lensSeries } from '../lens/model';
import { grapStageFor } from '../tasks/model';
import { levelForAqi } from '../design/levels';
import { clock24, isoDate } from '../today/time';
import type { TodayData } from '../today/types';
import type { AssistantContext } from './types';

/** "3 to 4 pm", the way a person says an hour. */
export function spanWords(at: string): string {
  const [h = '0'] = clock24(at).split(':');
  const hour = Number(h);
  const twelve = (n: number): string => String(n % 12 === 0 ? 12 : n % 12);
  const suffix = (n: number): string => (n % 24 < 12 ? 'am' : 'pm');
  const end = hour + 1;
  return suffix(hour) === suffix(end)
    ? `${twelve(hour)} to ${twelve(end)} ${suffix(end)}`
    : `${twelve(hour)} ${suffix(hour)} to ${twelve(end)} ${suffix(end)}`;
}

/** Where the numbers came from, in a few words: the monitor, how far away it is and how old its reading is. */
export function basisFor(data: TodayData): string {
  const p = data.provenance;
  if (p.mode === 'sample') return 'From the sample data in this prototype';
  if (p.stationName === undefined || p.distanceKm === undefined)
    return 'From the regional air model, since no monitor near here has reported lately';
  const age =
    p.ageMinutes < 90
      ? `${String(p.ageMinutes)} minutes old`
      : `${String(Math.round(p.ageMinutes / 60))} hours old`;
  return `From ${p.stationName}, ${String(Math.round(p.distanceKm * 10) / 10)} km away, ${age}`;
}

/** Gathers what the assistant should know: the first place's air and day, the alerts, and the people tracked. */
export function buildContext(
  place: string,
  data: TodayData,
  alerts: readonly Alert[],
  fires: number | undefined,
  people: readonly Person[],
): AssistantContext {
  const best = bestHour(lensSeries(data));
  return {
    place,
    aqi: data.aqi,
    level: levelForAqi(data.aqi).name,
    pm25: data.pm25,
    ...(best === undefined
      ? {}
      : {
          best: {
            // Past midnight, say so: "3 to 4 pm" alone would read as later today.
            span: `${spanWords(best.at)}${isoDate(best.at) === isoDate(data.asOf) ? '' : ' tomorrow'}`,
            aqi: best.aqi,
          },
        }),
    grapStage: grapStageFor(data),
    alerts: alerts.map((a) => a.title),
    alertsHi: alerts.map(alertTitleHindi),
    ...(fires === undefined ? {} : { fires }),
    basis: basisFor(data),
    people: people.map((p) => ({ name: p.name, age: p.age, day: p.day })),
  };
}
