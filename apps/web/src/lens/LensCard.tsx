import { ChevronDown, Compass, Eye, Navigation, Sunrise } from 'lucide-react';
import { useId, useState } from 'react';
import type { Pin } from '../data/pins';
import { levelForAqi } from '../design/levels';
import { clock24, dayMonth, weekday } from '../today/time';
import { Pill } from '../today/ui/Chip';
import { CONDITION_LABELS, FaceIcon, WeatherIcon } from '../today/ui/icons';
import { levelVars } from '../today/ui/format';
import { compassPoint } from '../today/wind';
import type { TodayData } from '../today/types';
import { SmokeSquare } from '../units/AirUnits';
import { formatDistance, type LensHour } from './model';

const age = (minutes: number): string =>
  minutes < 60 ? `${String(minutes)} min ago` : `${String(Math.round(minutes / 60))} h ago`;

/**
 * The air at the place and hour being looked at, as the same card the home screen uses for a place, opened out:
 * the name, the big number in the air's colour, the face, the weather, and under it the things worth knowing from
 * here (wind, how far you can see, the best hour to go out). It has no link: it is the place you are already in.
 */
export function LensCard({
  pin,
  data,
  hour,
  step,
  sight,
  arrow,
  advice,
  compass,
  cameraWords,
}: {
  readonly pin: Pin;
  readonly data: TodayData;
  readonly hour: LensHour;
  /** Hours from now: 0 is now. */
  readonly step: number;
  /** How far you could see, in kilometres. */
  readonly sight: number;
  /** The wind's arrow, in degrees, on the screen. */
  readonly arrow: number;
  readonly advice: string | undefined;
  readonly compass: {
    readonly needsTap: boolean;
    readonly enable: () => void;
    readonly heading: number | undefined;
  };
  readonly cameraWords: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const level = levelForAqi(hour.aqi);
  const p = data.provenance;
  const point = data.hourly.find((h) => h.at === hour.at);
  const w = point?.weather ?? (step === 0 ? data.weather : undefined);
  const when = step === 0 ? 'Now' : `${weekday(hour.at)} ${dayMonth(hour.at)}, ${clock24(hour.at)}`;
  return (
    <section
      className={`place-card lens-card${open ? ' open' : ''}`}
      style={levelVars(level)}
      aria-label="The air here"
    >
      <button
        type="button"
        className="pc-icon-button lens-more-toggle"
        aria-expanded={open}
        aria-controls={detailId}
        aria-label={open ? 'Show less' : 'Show more about the air here'}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <ChevronDown
          size={22}
          strokeWidth={2.25}
          aria-hidden="true"
          className={open ? 'flip' : ''}
        />
      </button>
      <div className="pc-hit">
        <span className="pc-name">{pin.id === 'live' ? 'Here' : pin.name}</span>
        <span className="pc-detail">{step === 0 ? (pin.detail ?? '') : when}</span>
        <span className="pc-aqi">
          <strong className="tnum">{hour.aqi}</strong>
          <span>AQI</span>
        </span>
        <span className="pc-level">{level.name}</span>
        {w !== undefined && (
          <span className="pc-sky">
            <span className="pc-sky-disc">
              <WeatherIcon condition={w.condition} isDay={w.isDay} size={18} />
            </span>
            <span className="tnum">{w.tempC}°</span>
            <span className="sr-only">{CONDITION_LABELS[w.condition]}</span>
          </span>
        )}
        <SmokeSquare pm25={hour.pm25} compact className="pc-smoke" />
        <span className="pc-face" aria-hidden="true">
          <FaceIcon face={level.face} size={56} />
        </span>
      </div>
      <div className="pc-more" id={detailId} hidden={!open}>
        <ul className="lens-facts">
          {hour.wind !== undefined && (
            <li>
              <Navigation
                size={18}
                strokeWidth={2}
                aria-hidden="true"
                style={{ transform: `rotate(${String(arrow)}deg)` }}
              />
              <span>
                Wind from the <strong>{compassPoint(hour.wind.fromDeg)}</strong>, {hour.wind.kmh}{' '}
                km/h
              </span>
            </li>
          )}
          <li>
            <Eye size={18} strokeWidth={2} aria-hidden="true" />
            <span>
              You could see about <strong>{formatDistance(sight)}</strong> <Pill>Estimate</Pill>
            </span>
          </li>
          {advice !== undefined && (
            <li>
              <Sunrise size={18} strokeWidth={2} aria-hidden="true" />
              <span>{advice}</span>
            </li>
          )}
        </ul>
        <details className="lens-more">
          <summary>About this view</summary>
          <p className="muted small lens-foot">
            {compass.needsTap ? (
              <button type="button" className="link-button" onClick={compass.enable}>
                <Compass size={14} aria-hidden="true" /> Turn on the compass
              </button>
            ) : (
              <span>
                {compass.heading === undefined
                  ? 'North is up.'
                  : `Facing ${compassPoint(compass.heading)}.`}
              </span>
            )}{' '}
            <span role="status">{cameraWords}</span>
          </p>
        </details>
        <p className="pc-source">
          {p.mode === 'sample' ? 'Sample data' : p.label}
          {p.stationName !== undefined && p.distanceKm !== undefined
            ? ` · ${p.stationName}, ${String(Math.round(p.distanceKm * 10) / 10)} km`
            : ''}{' '}
          · {age(p.ageMinutes)}
        </p>
      </div>
    </section>
  );
}
