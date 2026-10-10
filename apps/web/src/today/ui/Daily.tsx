import { useState } from 'react';
import { dayMonth, weekday } from '../time';
import type { TodayData } from '../types';
import { AqiChip } from './Chip';
import { CONDITION_LABELS, WeatherIcon, WindArrow } from './icons';

const RANGES = [3, 7] as const;

/** Three or seven days: air, sky, high and low, wind and rain. */
export function Daily({ data }: { readonly data: TodayData }): React.JSX.Element {
  const [range, setRange] = useState<(typeof RANGES)[number]>(7);
  return (
    <section className="card" aria-labelledby="daily-title">
      <div className="card-head">
        <h2 id="daily-title">Daily forecast</h2>
        <div className="segmented" role="group" aria-label="Days to show">
          {RANGES.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={range === n}
              onClick={() => {
                setRange(n);
              }}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>
      <ul className="daily">
        {data.daily.slice(0, range).map((day, index) => (
          <li key={day.date}>
            <span className="daily-day">
              <strong>{index === 0 ? 'Today' : weekday(day.date)}</strong>
              <span className="muted small">{dayMonth(day.date)}</span>
            </span>
            <AqiChip aqi={day.aqi} />
            <span className="daily-sky">
              <WeatherIcon condition={day.condition} isDay />
              <span className="sr-only">{CONDITION_LABELS[day.condition]}</span>
            </span>
            <span className="daily-temps tnum">
              <strong>{day.hiC}°</strong>
              <span className="muted">{day.loC}°</span>
            </span>
            <span className="daily-wind tnum">
              <WindArrow fromDeg={day.windFromDeg} />
              {day.windKmh} <span className="muted small">km/h</span>
            </span>
            <span className="daily-rain tnum">
              {day.rainChancePct}
              <span className="muted small">% rain</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
