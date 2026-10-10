import { compareWithWhoGuideline } from '@vayu/core';
import { levelVars, concentration, splitLabel } from './format';
import { POLLUTANTS, levelForReading } from '../pollutants';
import type { TodayData } from '../types';

/** Six tiles, each with a dot in the colour of its level, and the WHO line IQAir leads with. */
export function PollutantTiles({ data }: { readonly data: TodayData }): React.JSX.Element {
  const last24 = data.history.slice(-24);
  const mean = last24.reduce((sum, point) => sum + point.pm25, 0) / Math.max(1, last24.length);
  const who = compareWithWhoGuideline(mean);
  return (
    <section className="card" aria-labelledby="pollutants-title">
      <div className="card-head">
        <h2 id="pollutants-title">Air pollutants</h2>
      </div>
      <ul className="tiles">
        {POLLUTANTS.map((info) => {
          const value = data.pollutants[info.key];
          // A gas the regional model did not give is left out, never filled in.
          if (value === undefined) return null;
          const [base, sub] = splitLabel(info.label);
          return (
            <li key={info.key} className="tile" style={levelVars(levelForReading(info, value))}>
              <span className="tile-name">
                <span className="dot" aria-hidden="true" />
                <span>
                  {base}
                  <sub>{sub}</sub>
                </span>
                <span className="sr-only">
                  {' '}
                  {info.plain}, {levelForReading(info, value).name}
                </span>
              </span>
              <span className="tile-value">
                <strong className="tnum">
                  {info.key === 'pm25' || info.key === 'pm10'
                    ? concentration(value)
                    : Math.round(value)}
                </strong>{' '}
                <span className="muted small">{info.unit}</span>
              </span>
              <span className="muted small tile-plain" aria-hidden="true">
                {info.plain}
              </span>
            </li>
          );
        })}
      </ul>
      {data.provenance.mode !== 'sample' && (
        <p className="muted small">
          PM2.5 is the reading. PM10 and the gases are from a regional model, not measured here.
        </p>
      )}
      {who !== undefined && (
        <p className="who">
          {who.within
            ? `PM2.5 over the last 24 hours averaged ${concentration(who.mean)} µg/m³, within the WHO 24-hour guideline of ${String(who.guideline)} µg/m³.`
            : `PM2.5 over the last 24 hours averaged ${concentration(who.mean)} µg/m³: ${who.times.toFixed(1)} times the WHO 24-hour guideline of ${String(who.guideline)} µg/m³.`}
        </p>
      )}
    </section>
  );
}
