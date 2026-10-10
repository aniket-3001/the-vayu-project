import { School, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Pin } from '../../data/pins';
import { levelForAqi } from '../../design/levels';
import { weekday } from '../../today/time';
import { AqiChip } from '../../today/ui/Chip';
import { levelVars } from '../../today/ui/format';
import { CONDITION_LABELS, FaceIcon, WeatherIcon } from '../../today/ui/icons';
import { AirFigures } from '../../units/AirUnits';
import { airStore, useToday } from '../../air/store';
import { assemblyFor } from '../../alerts/assembly';
import { roleOfLabel } from '../roles';
import { AirLoading } from '../../components/AirState';

const age = (minutes: number): string =>
  minutes < 60 ? `${String(minutes)} min ago` : `${String(Math.round(minutes / 60))} h ago`;

/**
 * One pinned place as a card in the colour of its air, with everything on it and nothing to open: the name and
 * where it is, the AQI (with the cigarettes joined to it when that is on), what that means, the weather and the
 * face; and in the lower half today and the next two days, and where the reading came from. Pressing the card
 * opens the place.
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
  const removeButton =
    onRemove === undefined ? null : (
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
        <div className="pc-actions">{removeButton}</div>
      </li>
    );
  }
  const reading = state.data;
  // A school shows where its morning assembly should be held, from the air expected at eight.
  const assembly = roleOfLabel(pin.name) === 'school' ? assemblyFor(reading) : undefined;
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
        <AirFigures aqi={reading.aqi} pm25={reading.pm25} layout="auto" />
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
          <FaceIcon face={level.face} size={60} />
        </span>
      </Link>
      <div className="pc-more">
        {assembly !== undefined && (
          <p className={`pc-assembly ${assembly.where}`}>
            <School size={16} strokeWidth={2} aria-hidden="true" />
            <span>
              <strong>Morning assembly: {assembly.label}</strong>
              <span className="pc-assembly-words">{assembly.words}</span>
            </span>
          </p>
        )}
        <ul className="pc-days" aria-label="Today and the next two days">
          {reading.daily.slice(0, 3).map((day, index) => (
            <li key={day.date}>
              <span className="pc-day-name">{index === 0 ? 'Today' : weekday(day.date)}</span>
              {day.aqi === undefined ? (
                <span className="muted small">no air forecast</span>
              ) : (
                <AqiChip aqi={day.aqi} />
              )}
              {day.sky !== undefined && (
                <span className="tnum pc-day-temps">
                  <WeatherIcon condition={day.sky.condition} isDay size={16} />
                  {day.sky.hiC}° <span className="pc-lo">{day.sky.loC}°</span>
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="pc-source">
          {p.mode === 'sample' ? 'Sample data' : p.label}
          {p.stationName !== undefined && p.distanceKm !== undefined
            ? ` · ${p.stationName}, ${String(Math.round(p.distanceKm * 10) / 10)} km`
            : ''}{' '}
          · {age(p.ageMinutes)}
        </p>
      </div>
      <div className="pc-actions">{removeButton}</div>
    </li>
  );
}
