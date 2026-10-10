import type { Alert } from '../alerts/model';
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
    best:
      best === undefined
        ? undefined
        : {
            // Past midnight, say so: "3 to 4 pm" alone would read as later today.
            span: `${spanWords(best.at)}${isoDate(best.at) === isoDate(data.asOf) ? '' : ' tomorrow'}`,
            aqi: best.aqi,
          },
    grapStage: grapStageFor(data),
    alerts: alerts.map((a) => a.title),
    fires,
    people: people.map((p) => ({ name: p.name, age: p.age, day: p.day })),
  };
}
