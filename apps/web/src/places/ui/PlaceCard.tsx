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
import { grapStageFor } from '../../tasks/model';
import { isSchoolPin } from '../roles';
import { AirLoading } from '../../components/AirState';

/** When a card was last let go after being dragged, so the press that ends a drag does not open it. */
export const dragState = { endedAt: 0 };
export const markDragEnd = (): void => {
  dragState.endedAt = Date.now();
};

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
  drag,
  live,
}: {
  readonly pin: Pin;
  /** Without it the card has no cross: the live place goes by turning live location off. */
  readonly onRemove?: (pin: Pin) => void;
  /** What a dragging library hands the card so it can be moved: a ref, a style and the handlers. */
  readonly drag?: {
    readonly setNodeRef: (node: HTMLElement | null) => void;
    readonly style: React.CSSProperties;
    readonly attributes: React.HTMLAttributes<HTMLElement>;
    readonly listeners: React.DOMAttributes<HTMLElement> | undefined;
    readonly dragging: boolean;
  };
  /**
   * For the live card: the name of the saved place it is the same as, or none if it is out somewhere else. The card
   * then says “Same as Home”, or “Live location” with an Outdoor tag, and wears the live marking.
   */
  readonly live?: { readonly sameAs: string | undefined };
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
      <li
        className="place-card pending"
        ref={drag?.setNodeRef}
        style={drag?.style}
        {...(drag?.attributes ?? {})}
        {...(drag?.listeners ?? {})}
      >
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
  // The live card is called what it is the same as, or Live location; a saved place is called by its name.
  const heading =
    live === undefined
      ? pin.name
      : live.sameAs === undefined
        ? 'Live location'
        : `Same as ${live.sameAs}`;
  // A school shows where its morning assembly should be held, from the air expected at eight.
  const assembly = isSchoolPin(pin) ? assemblyFor(reading) : undefined;
  const level = levelForAqi(reading.aqi);
  // A GRAP stage likely at this place, by our estimate, as a pill that glows in the stage's colour.
  const stage = grapStageFor(reading);
  const p = reading.provenance;
  const w = reading.weather;
  return (
    <li
      className={`place-card${live === undefined ? '' : ' live-card'}${drag?.dragging === true ? ' dragging' : ''}`}
      ref={drag?.setNodeRef}
      style={{ ...levelVars(level), ...(drag?.style ?? {}) }}
      {...(drag?.attributes ?? {})}
      {...(drag?.listeners ?? {})}
    >
      <Link
        to={`/place/${encodeURIComponent(pin.id)}`}
        className="pc-hit"
        aria-label={`Open ${heading}`}
        draggable={false}
        onClick={(event) => {
          // A card that was just dragged is not also pressed.
          if (Date.now() - dragState.endedAt < 300) event.preventDefault();
        }}
      >
        <span className="pc-name">{heading}</span>
        <span className="pc-detail">{pin.detail ?? 'Delhi NCR'}</span>
        {live !== undefined && (
          <span className="live-tags">
            <span className="live-pill">
              <i className="live-dot" aria-hidden="true" />
              LIVE
            </span>
            {live.sameAs === undefined && <span className="outdoor-tag">Outdoor</span>}
          </span>
        )}
        <AirFigures aqi={reading.aqi} pm25={reading.pm25} layout="auto" />
        <span className="pc-line">
          {stage !== 0 && (
            <span
              className={`grap-pill grap-s${String(stage)}`}
              title={`GRAP Stage ${String(stage)} is likely here (our estimate, not an order)`}
            >
              GRAP {stage}
            </span>
          )}
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
