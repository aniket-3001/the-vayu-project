import { rules, type RawHour } from '@vayu/contracts';
import { aqi24h } from './bands';
import { HOUR_MS, localDate, toIso, toMs } from './time';
import { availableHours, patternForecast } from './timeline';

export interface HeadsUp {
  readonly fire: boolean;
  readonly aqiNow24h: number | null;
  readonly aqiForecast24h: number | null;
  /** The larger of the two, which is what was compared with the threshold. */
  readonly level: number | null;
}

/**
 * The early heads-up. It fires when the larger of the current and the forecast 24-hour AQI
 * reaches `headsUpAqi` (430), a 20-point margin under the official Stage IV level of 450, so it
 * leans cautious on purpose.
 */
export function grapHeadsUp(
  aqiNow24h: number | null,
  aqiForecast24h: number | null,
  limits = rules.grap,
): HeadsUp {
  const known = [aqiNow24h, aqiForecast24h].filter((value): value is number => value !== null);
  const level = known.length > 0 ? Math.max(...known) : null;
  return { fire: level !== null && level >= limits.headsUpAqi, aqiNow24h, aqiForecast24h, level };
}

export interface GrapEvaluation {
  /** Days on which the true 24-hour AQI went above the official Stage IV level. */
  readonly events: number;
  readonly caught: number;
  readonly recall: number | null;
  /** Separate runs of heads-ups. */
  readonly headsUps: number;
  readonly falseAlarms: number;
}

/**
 * Replays a station series hour by hour. At each hour it sees only data that had ended (rule I1),
 * builds a pattern forecast and decides whether a heads-up fires. Then it counts the real events
 * it caught and the warnings with no event within 24 hours.
 */
export function evaluateGrap(series: readonly RawHour[], limits = rules.grap): GrapEvaluation {
  const sorted = [...series].sort((a, b) => toMs(a.hourStart) - toMs(b.hourStart));
  const fireTimes: number[] = [];
  const exceedTimes: { readonly at: number; readonly date: string }[] = [];

  for (const hour of sorted) {
    const at = toMs(hour.hourStart) + HOUR_MS;
    const asOf = toIso(at);
    const history = availableHours(sorted, asOf);
    const last24 = history.slice(-24);
    if (last24.length < 24) continue;

    const now = aqi24h(
      last24.map((h) => h.pm25),
      last24.map((h) => h.pm10),
    );
    if (now !== null && now.aqi > limits.officialStageIvAqi) {
      exceedTimes.push({ at, date: localDate(asOf) });
    }
    const forecast = patternForecast(history, asOf, 24);
    const forecastAqi =
      forecast.length > 0
        ? aqi24h(
            forecast.map((h) => h.pm25),
            forecast.map((h) => h.pm10),
          )
        : null;
    if (grapHeadsUp(now?.aqi ?? null, forecastAqi?.aqi ?? null, limits).fire) fireTimes.push(at);
  }

  const firstExceedPerDay = new Map<string, number>();
  for (const { at, date } of exceedTimes)
    if (!firstExceedPerDay.has(date)) firstExceedPerDay.set(date, at);
  const caught = [...firstExceedPerDay.values()].filter((firstAt) =>
    fireTimes.some((fireAt) => fireAt <= firstAt && fireAt >= firstAt - 24 * HOUR_MS),
  ).length;

  // A long run of heads-ups counts once, by its start.
  const episodeStarts = fireTimes.reduce<number[]>((starts, fireAt) => {
    const previous = starts.at(-1);
    return previous === undefined || fireAt - previous > HOUR_MS ? [...starts, fireAt] : starts;
  }, []);
  const falseAlarms = episodeStarts.filter(
    (start) => !exceedTimes.some(({ at }) => at >= start && at <= start + 24 * HOUR_MS),
  ).length;

  return {
    events: firstExceedPerDay.size,
    caught,
    recall: firstExceedPerDay.size > 0 ? caught / firstExceedPerDay.size : null,
    headsUps: episodeStarts.length,
    falseAlarms,
  };
}
