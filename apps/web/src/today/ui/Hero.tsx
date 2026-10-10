import { Droplets, Thermometer } from 'lucide-react';
import { levelForAqi } from '../../design/levels';
import { headlineFor } from '../advice';
import { POLLUTANTS } from '../pollutants';
import type { TodayData } from '../types';
import { compassPoint } from '../wind';
import { FaceIcon, WindArrow } from './icons';
import { concentration, splitLabel } from './format';
import { useSettle } from './hooks';

/** The status card: the number, what it means, the main pollutant, and the weather right now. */
export function Hero({ data }: { readonly data: TodayData }): React.JSX.Element {
  const level = levelForAqi(data.aqi);
  const shown = useSettle(data.aqi);
  const info = POLLUTANTS[0];
  const [base, sub] = splitLabel(info?.label ?? 'PM2.5');
  const w = data.weather;
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-top">
        <div className="badge">
          <span className="sr-only">AQI {data.aqi}</span>
          <span className="badge-num" aria-hidden="true">
            {shown}
          </span>
          <span className="badge-unit" aria-hidden="true">
            AQI
          </span>
        </div>
        <div className="hero-words">
          <h2 id="hero-title" className="hero-level">
            {level.name}
          </h2>
          <p className="hero-line">{headlineFor(data.aqi)}</p>
        </div>
        <FaceIcon face={level.face} size={76} />
      </div>
      <dl className="hero-main">
        <dt>Main pollutant</dt>
        <dd>
          <span className="pollutant-name">
            {base}
            <sub>{sub}</sub>
          </span>
          <strong className="tnum">{concentration(data.pm25)}</strong> µg/m³
        </dd>
      </dl>
      <ul className="hero-weather" aria-label="Weather now">
        <li>
          <Thermometer size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="tnum">{w.tempC}°C</span>
        </li>
        <li>
          <WindArrow fromDeg={w.windFromDeg} size={20} />
          <span className="tnum">{w.windKmh} km/h</span>
          <span className="sr-only">, from the {compassPoint(w.windFromDeg)}</span>
        </li>
        <li>
          <Droplets size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="tnum">{w.humidityPct}%</span>
          <span className="sr-only"> humidity</span>
        </li>
      </ul>
    </section>
  );
}
