import { Fragment } from 'react';
import { isoDate, clock24, weekday, dayMonth } from '../time';
import type { TodayData } from '../types';
import { AqiChip } from './Chip';
import { WeatherIcon, WindArrow } from './icons';

/** The next 48 hours as a table that scrolls sideways, with the row names pinned on the left. */
export function Hourly({ data }: { readonly data: TodayData }): React.JSX.Element {
  const points = data.hourly;
  const startsDay = (index: number): boolean => {
    const point = points[index];
    const before = points[index - 1];
    return point !== undefined && before !== undefined && isoDate(point.at) !== isoDate(before.at);
  };
  return (
    <section className="card" aria-labelledby="hourly-title">
      <div className="card-head">
        <h2 id="hourly-title">Hourly forecast</h2>
        <span className="muted small">Our estimate, not a measurement</span>
      </div>
      {/* A region that scrolls has to be reachable by keyboard, so it takes focus. */}
      <div
        className="scroller"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-label="Hourly forecast, scrolls sideways"
      >
        <table className="hourly">
          <thead>
            <tr>
              <th scope="row">Time</th>
              {points.map((point, index) => (
                <th
                  scope="col"
                  key={point.at}
                  className={startsDay(index) ? 'day-start' : undefined}
                >
                  {startsDay(index) && (
                    <span className="day-tag">
                      {weekday(point.at)} {dayMonth(point.at).split(' ')[0]}
                    </span>
                  )}
                  {index === 0 ? 'Now' : clock24(point.at)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="US AQI" points={points} cell={(p) => <AqiChip aqi={p.aqi} />} />
            <Row
              label="Sky"
              points={points}
              cell={(p) => <WeatherIcon condition={p.weather.condition} isDay={p.weather.isDay} />}
            />
            <Row
              label="Temp, °C"
              points={points}
              cell={(p) => <span className="tnum">{p.weather.tempC}°</span>}
            />
            <Row
              label="Wind, km/h"
              points={points}
              cell={(p) => (
                <span className="wind-cell">
                  <WindArrow fromDeg={p.weather.windFromDeg} />
                  <span className="tnum">{p.weather.windKmh}</span>
                </span>
              )}
            />
            <Row
              label="Humidity, %"
              points={points}
              cell={(p) => <span className="tnum">{p.weather.humidityPct}</span>}
            />
            <Row
              label="Rain chance, %"
              points={points}
              cell={(p) => (
                <span className={`tnum${p.weather.rainChancePct < 20 ? ' faint' : ''}`}>
                  {p.weather.rainChancePct}
                </span>
              )}
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({
  label,
  points,
  cell,
}: {
  readonly label: string;
  readonly points: TodayData['hourly'];
  readonly cell: (point: TodayData['hourly'][number]) => React.ReactNode;
}): React.JSX.Element {
  return (
    <tr>
      <th scope="row">{label}</th>
      {points.map((point, index) => (
        <Fragment key={point.at}>
          <td
            className={
              index > 0 && isoDate(point.at) !== isoDate(points[index - 1]?.at ?? point.at)
                ? 'day-start'
                : undefined
            }
          >
            {cell(point)}
          </td>
        </Fragment>
      ))}
    </tr>
  );
}
