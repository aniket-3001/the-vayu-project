import {
  Camera,
  CameraOff,
  ChevronDown,
  Eye,
  Navigation,
  Sunrise,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import type { Pin } from '../data/pins';
import { levelForAqi } from '../design/levels';
import { clock24, dayMonth, weekday } from '../today/time';
import { Pill } from '../today/ui/Chip';
import { CONDITION_LABELS, FaceIcon, WeatherIcon } from '../today/ui/icons';
import { levelVars } from '../today/ui/format';
import { compassPoint } from '../today/wind';
import type { TodayData } from '../today/types';
import { AirFigures } from '../units/AirUnits';
import { formatDistance, type LensHour } from './model';

const age = (minutes: number): string =>
  minutes < 60 ? `${String(minutes)} min ago` : `${String(Math.round(minutes / 60))} h ago`;

/** The name the place switch gives the live place, everywhere it is named. */
export const LIVE_OUTDOOR_NAME = 'Live outdoor location';

/**
 * The air at the place and hour being looked at, as the same card the home screen uses for a place: the name, the
 * AQI (with the cigarettes joined to it when that is on), the face, the weather, and the things worth knowing from
 * here (wind, how far you can see, the best hour to go out). The two things you do to the view sit in its top right
 * corner: see it live through the camera, and switch to another place (or to where you are). The arrow folds the
 * card down to one line so the picture behind it is clear.
 */
export function LensCard({
  pin,
  data,
  hour,
  step,
  sight,
  arrow,
  advice,
  camera,
  places,
  cameraWords,
  icon: PlaceIcon,
}: {
  readonly pin: Pin;
  readonly data: TodayData;
  readonly hour: LensHour;
  /** Hours from now: 0 is now. */
  readonly step: number;
  /** How far you could see, in kilometres. */
  readonly sight: number;
  /** The wind's arrow, in degrees. */
  readonly arrow: number;
  readonly advice: string | undefined;
  readonly camera: { readonly on: boolean; readonly toggle: () => void };
  readonly places: {
    readonly options: readonly { readonly id: string; readonly name: string }[];
    readonly activeId: string;
    readonly onChange: (id: string) => void;
  };
  /** Said under the buttons only when the camera could not be had. */
  readonly cameraWords: string | undefined;
  readonly icon: LucideIcon;
}): React.JSX.Element {
  const [folded, setFolded] = useState(false);
  const bodyId = useId();
  const level = levelForAqi(hour.aqi);
  const p = data.provenance;
  const point = data.hourly.find((h) => h.at === hour.at);
  const w = point?.weather ?? (step === 0 ? data.weather : undefined);
  const when = step === 0 ? 'Now' : `${weekday(hour.at)} ${dayMonth(hour.at)}, ${clock24(hour.at)}`;
  const name = pin.id === 'live' ? LIVE_OUTDOOR_NAME : pin.name;
  const active = places.options.find((o) => o.id === places.activeId);
  return (
    <section
      className={`place-card lens-card${folded ? ' folded' : ''}`}
      style={levelVars(level)}
      aria-label="The air here"
    >
      <div className="lens-head">
        <div className="lens-title">
          <span className="pc-name">{name}</span>
          <span className="pc-detail">{step === 0 ? (pin.detail ?? '') : when}</span>
        </div>
        <div className="lens-tools">
          <button
            type="button"
            className="lens-tool"
            aria-pressed={camera.on}
            onClick={camera.toggle}
          >
            {camera.on ? (
              <CameraOff size={18} strokeWidth={2} aria-hidden="true" />
            ) : (
              <Camera size={18} strokeWidth={2} aria-hidden="true" />
            )}
            <span>{camera.on ? 'Stop camera' : 'See it live'}</span>
          </button>
          <label className="lens-tool lens-switch" title="Place to look at">
            <PlaceIcon size={18} strokeWidth={2} aria-hidden="true" />
            <span className="lens-switch-name">{active?.name ?? name}</span>
            <ChevronDown size={16} strokeWidth={2.25} aria-hidden="true" />
            <span className="sr-only">Place to look at</span>
            <select
              value={places.activeId}
              onChange={(event) => {
                places.onChange(event.target.value);
              }}
            >
              {places.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="pc-icon-button lens-fold"
            aria-expanded={!folded}
            aria-controls={bodyId}
            aria-label={folded ? 'Show the details' : 'Fold the card'}
            onClick={() => {
              setFolded((v) => !v);
            }}
          >
            <ChevronDown
              size={22}
              strokeWidth={2.25}
              aria-hidden="true"
              className={folded ? '' : 'flip'}
            />
          </button>
        </div>
      </div>
      {cameraWords !== undefined && (
        <p className="lens-note small" role="status">
          {cameraWords}
        </p>
      )}
      <div className="lens-body" id={bodyId}>
        <div className="pc-hit lens-main">
          <AirFigures aqi={hour.aqi} pm25={hour.pm25} />
          <span className="pc-line">
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
          </span>
          {!folded && (
            <span className="pc-face" aria-hidden="true">
              <FaceIcon face={level.face} size={72} />
            </span>
          )}
        </div>
        {!folded && (
          <>
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
                    Wind from the <strong>{compassPoint(hour.wind.fromDeg)}</strong>,{' '}
                    {hour.wind.kmh} km/h
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
                <li className="lens-advice">
                  <Sunrise size={18} strokeWidth={2} aria-hidden="true" />
                  <span>{advice}</span>
                </li>
              )}
            </ul>
            <p className="pc-source">
              {p.mode === 'sample' ? 'Sample data' : p.label}
              {p.stationName !== undefined && p.distanceKm !== undefined
                ? ` · ${p.stationName}, ${String(Math.round(p.distanceKm * 10) / 10)} km`
                : ''}{' '}
              · {age(p.ageMinutes)}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
