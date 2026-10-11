import { CloudRain, Droplet } from 'lucide-react';
import { Fragment } from 'react';
import { isoDate, clock12, weekday, dayMonth } from '../time';
import type { TodayData } from '../types';
import { AqiChip } from './Chip';
import { WeatherIcon, WindArrow } from './icons';
import type { Condition } from '../types';

/** The word for the sky in an hour, as a person would say it: sunny by day, clear at night. */
export const skyWord = (condition: Condition, isDay: boolean): string => {
  switch (condition) {
    case 'clear':
      return isDay ? 'Sunny' : 'Clear';
    case 'partly-cloudy':
      return 'Partly cloudy';
    case 'cloudy':
      return 'Cloudy';
    case 'haze':
      return 'Hazy';
    case 'fog':
      return 'Foggy';
    case 'drizzle':
      return 'Drizzle';
    case 'rain':
      return 'Rainy';
    case 'thunderstorm':
      return 'Stormy';
    case 'windy':
      return 'Windy';
    case 'dust':
      return 'Dusty';
  }
};

/** The next 48 hours as a table that scrolls sideways, each row named at its left: air, sky, temperature, wind speed, humidity, chance of rain. */
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
              <th scope="row" className="row-label">
                Time
              </th>
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
                  {index === 0 ? 'Now' : clock12(point.at)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Air quality (AQI)" points={points} cell={(p) => <AqiChip aqi={p.aqi} />} />
            <Row
              label="Sky"
              points={points}
              cell={(p) =>
                p.weather === undefined ? (
                  <Missing />
                ) : (
                  <span className="stack">
                    <WeatherIcon condition={p.weather.condition} isDay={p.weather.isDay} />
                    <span className="sky-word">
                      {skyWord(p.weather.condition, p.weather.isDay)}
                    </span>
                  </span>
                )
              }
            />
            <Row
              label="Temperature, °C"
              points={points}
              cell={(p) =>
                p.weather === undefined ? (
                  <Missing />
                ) : (
                  <span className="tnum">{p.weather.tempC}°</span>
                )
              }
            />
            <Row
              label="Wind speed, km/h"
              points={points}
              cell={(p) =>
                p.weather === undefined ? (
                  <Missing />
                ) : (
                  <span className="stack">
                    <WindArrow fromDeg={p.weather.windFromDeg} size={18} />
                    <span className="tnum">{p.weather.windKmh}</span>
                    <span className="unit">km/h</span>
                  </span>
                )
              }
            />
            <Row
              label="Humidity, %"
              points={points}
              cell={(p) =>
                p.weather === undefined ? (
                  <Missing />
                ) : (
                  <span className="stack">
                    <Droplet size={18} strokeWidth={1.75} className="ic-drop" aria-hidden="true" />
                    <span className="tnum">{p.weather.humidityPct}%</span>
                  </span>
                )
              }
            />
            <Row
              label="Chance of rain, %"
              points={points}
              cell={(p) =>
                p.weather === undefined ? (
                  <Missing />
                ) : (
                  <span className={`stack${p.weather.rainChancePct < 20 ? ' faint' : ''}`}>
                    <CloudRain
                      size={18}
                      strokeWidth={1.75}
                      className="ic-rain"
                      aria-hidden="true"
                    />
                    <span className="tnum">{p.weather.rainChancePct}%</span>
                  </span>
                )
              }
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** An hour the weather model had nothing for. */
const Missing = (): React.JSX.Element => (
  <span className="muted" title="No weather for this hour">
    –
  </span>
);

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
      <th scope="row" className="row-label">
        {label}
      </th>
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
