import { Camera, CameraOff, ChevronDown, type LucideIcon } from 'lucide-react';
import type { Pin } from '../data/pins';
import { levelForAqi } from '../design/levels';
import { dayMonth, hourOfDay, hourRange, isoDate, weekday, clock12 } from '../today/time';
import { CONDITION_LABELS, FaceIcon, WeatherIcon } from '../today/ui/icons';
import { levelVars } from '../today/ui/format';
import type { TodayData } from '../today/types';
import { AirFigures } from '../units/AirUnits';
import type { LensHour } from './model';

/** The name the place switch gives the live place, everywhere it is named. */
export const LIVE_OUTDOOR_NAME = 'Live outdoor location';

/**
 * The air at the place and hour being looked at, as the same card the home screen uses for a place: the name, the
 * AQI (with the cigarettes joined to it when that is on), the face, and one line: the weather, then the cleanest
 * daylight hour with the AQI it will have. Nothing else. The two things you do to the view sit in its top right
 * corner: see it live through the camera, and switch to another place (or to where you are).
 */
export function LensCard({
  pin,
  data,
  hour,
  step,
  best,
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
  /** The cleanest daylight hour ahead, if there is one. */
  readonly best: LensHour | undefined;
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
  const level = levelForAqi(hour.aqi);
  const point = data.hourly.find((h) => h.at === hour.at);
  const w = point?.weather ?? (step === 0 ? data.weather : undefined);
  const when = step === 0 ? 'Now' : `${weekday(hour.at)} ${dayMonth(hour.at)}, ${clock12(hour.at)}`;
  const name = pin.id === 'live' ? LIVE_OUTDOOR_NAME : pin.name;
  const active = places.options.find((o) => o.id === places.activeId);
  const bestWords =
    best === undefined
      ? undefined
      : best.aqi > 150
        ? 'No clean hour today'
        : `Cleanest ${hourRange(Math.floor(hourOfDay(best.at)))}${isoDate(best.at) === isoDate(data.asOf) ? '' : ' tomorrow'} (AQI ${String(best.aqi)})`;
  return (
    <section className="place-card lens-card" style={levelVars(level)} aria-label="The air here">
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
        </div>
      </div>
      {cameraWords !== undefined && (
        <p className="lens-note small" role="status">
          {cameraWords}
        </p>
      )}
      <div className="lens-body">
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
            {bestWords !== undefined && (
              <span className="lens-best-wrap">
                <span className="lens-bar" aria-hidden="true">
                  |
                </span>
                <span className="lens-best">{bestWords}</span>
              </span>
            )}
          </span>
          <span className="pc-face" aria-hidden="true">
            <FaceIcon face={level.face} size={72} />
          </span>
        </div>
      </div>
    </section>
  );
}
