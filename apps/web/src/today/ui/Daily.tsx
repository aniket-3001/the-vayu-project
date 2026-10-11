import { dayMonth, weekday } from '../time';
import type { TodayData } from '../types';
import { AqiChip } from './Chip';
import { CONDITION_LABELS, WeatherIcon, WindArrow } from './icons';

/** How many days the list shows: the air forecast reaches about five days. */
const DAYS = 5;

/** The next five days: air, sky, high and low, wind and rain. */
export function Daily({ data }: { readonly data: TodayData }): React.JSX.Element {
  return (
    <section className="card" aria-labelledby="daily-title">
      <div className="card-head">
        <h2 id="daily-title">Daily forecast</h2>
        <span className="muted small">Next 5 days</span>
      </div>
      <ul className="daily">
        {data.daily.slice(0, DAYS).map((day, index) => (
          <li key={day.date}>
            <span className="daily-day">
              <strong>{index === 0 ? 'Today' : weekday(day.date)}</strong>
              <span className="muted small">{dayMonth(day.date)}</span>
            </span>
            {day.aqi === undefined ? (
              <span className="muted small daily-noair">No air forecast yet</span>
            ) : (
              <AqiChip aqi={day.aqi} />
            )}
            {day.sky === undefined ? (
              <span className="muted small daily-missing">No weather for this day</span>
            ) : (
              <>
                <span className="daily-sky">
                  <WeatherIcon condition={day.sky.condition} isDay />
                  <span className="sr-only">{CONDITION_LABELS[day.sky.condition]}</span>
                </span>
                <span className="daily-temps tnum">
                  <strong>{day.sky.hiC}°</strong>
                  <span className="muted">{day.sky.loC}°</span>
                </span>
                <span className="daily-wind tnum">
                  <WindArrow fromDeg={day.sky.windFromDeg} />
                  {day.sky.windKmh} <span className="muted small">km/h</span>
                </span>
                <span className="daily-rain tnum">
                  {day.sky.rainChancePct}
                  <span className="muted small">% rain</span>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {data.daily.slice(0, DAYS).some((day) => day.aqi === undefined) && (
        <p className="muted small">
          Days with no air forecast show the weather only, and we do not guess the air.
        </p>
      )}
    </section>
  );
}
