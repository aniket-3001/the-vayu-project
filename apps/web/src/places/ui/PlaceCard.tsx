import { Droplet, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Pin } from '../../data/pins';
import { levelForAqi } from '../../design/levels';
import { weekday } from '../../today/time';
import { AqiChip } from '../../today/ui/Chip';
import { levelVars } from '../../today/ui/format';
import { CONDITION_LABELS, FaceIcon, WeatherIcon } from '../../today/ui/icons';
import { AirFigures } from '../../units/AirUnits';
import { airStore, useToday } from '../../air/store';
import { AirLoading } from '../../components/AirState';

const age = (minutes: number): string =>
  minutes < 60 ? `${String(minutes)} min ago` : `${String(Math.round(minutes / 60))} h ago`;

/**
 * One pinned place as a card in the colour of its air, as wide as the screen so that everything fits on it: the
 * name and where it is, the AQI (and the cigarettes beside it when that is on), what that means and the weather,
 * the face, then today and the next two days, and where the reading came from. Pressing it opens the place.
 */
export function PlaceCard({
  pin,
  onRemove,
}: {
  readonly pin: Pin;
  /** Without it the card has no cross: the live place goes by turning live location off. */
  readonly onRemove?: (pin: Pin) => void;
}): React.JSX.Element {
  const state = useToday(pin);
  const remove =
    onRemove === undefined ? null : (
      <div className="pc-actions">
        <button
          type="button"
          className="pc-icon-button"
          aria-label={`Remove ${pin.name}`}
          onClick={() => {
            onRemove(pin);
          }}
        >
          <X size={18} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
    );
  if (state?.status !== 'ready') {
    return (
      <li className="place-card pending">
        <div className="pc-hit">
          <span className="pc-name">{pin.name}</span>
          <span className="pc-detail">{pin.detail ?? 'Delhi NCR'}</span>
          {state?.status === 'error' ? (
            <>
              <span className="pc-level">No reading right now</span>
              <button
                type="button"
                className="plain"
                onClick={() => {
                  airStore().ensureToday(pin, true);
                }}
              >
                Try again
              </button>
            </>
          ) : (
            <AirLoading />
          )}
        </div>
        {remove}
      </li>
    );
  }
  const reading = state.data;
  const level = levelForAqi(reading.aqi);
  const p = reading.provenance;
  const w = reading.weather;
  return (
    <li className="place-card" style={levelVars(level)}>
      <Link
        to={`/place/${encodeURIComponent(pin.id)}`}
        className="pc-hit"
        aria-label={`Open ${pin.name}`}
      >
        <span className="pc-name">
          {pin.name}
          {pin.id === 'live' && <span className="pc-live">Live</span>}
        </span>
        <span className="pc-detail">{pin.detail ?? 'Delhi NCR'}</span>
        <AirFigures aqi={reading.aqi} pm25={reading.pm25} />
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
        <span className="pc-face" aria-hidden="true">
          <FaceIcon face={level.face} size={84} />
        </span>
        <span className="pc-days" role="list" aria-label="Today and the next two days">
          {reading.daily.slice(0, 3).map((day, index) => (
            <span key={day.date} className="pc-day" role="listitem">
              <span className="pc-day-name">{index === 0 ? 'Today' : weekday(day.date)}</span>
              <AqiChip aqi={day.aqi} />
              {day.sky !== undefined && (
                <span className="pc-day-sky">
                  <WeatherIcon condition={day.sky.condition} isDay size={18} />
                  <span className="tnum">
                    {day.sky.hiC}° <span className="pc-lo">{day.sky.loC}°</span>
                  </span>
                  <span className="tnum pc-day-rain">
                    <Droplet size={12} strokeWidth={2} className="ic-drop" aria-hidden="true" />
                    {day.sky.rainChancePct}%
                  </span>
                </span>
              )}
            </span>
          ))}
        </span>
        <span className="pc-source">
          {p.mode === 'sample' ? 'Sample data' : p.label}
          {p.stationName !== undefined && p.distanceKm !== undefined
            ? ` · ${p.stationName}, ${String(Math.round(p.distanceKm * 10) / 10)} km`
            : ''}{' '}
          · {age(p.ageMinutes)}
        </span>
      </Link>
      {remove}
    </li>
  );
}
