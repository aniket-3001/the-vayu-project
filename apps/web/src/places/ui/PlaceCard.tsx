import { ChevronDown, Droplet, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Pin } from '../../data/pins';
import { levelForAqi } from '../../design/levels';
import { weekday } from '../../today/time';
import { AqiChip } from '../../today/ui/Chip';
import { levelVars } from '../../today/ui/format';
import { CONDITION_LABELS, FaceIcon, WeatherIcon } from '../../today/ui/icons';
import { SmokeSquare } from '../../units/AirUnits';
import { readingForPin } from '../placeSample';

const age = (minutes: number): string =>
  minutes < 60 ? `${String(minutes)} min ago` : `${String(Math.round(minutes / 60))} h ago`;

/**
 * One pinned place as a square in the colour of its air. The name is top left, the number bottom left, and the
 * face fills the bottom right. Pressing the card opens the place; the arrow by the cross opens the card out to
 * today and the next two days.
 */
export function PlaceCard({
  pin,
  onRemove,
}: {
  readonly pin: Pin;
  readonly onRemove: (pin: Pin) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const reading = readingForPin(pin);
  const level = levelForAqi(reading.aqi);
  const p = reading.provenance;
  const w = reading.weather;
  return (
    <li className={`place-card${open ? ' open' : ''}`} style={levelVars(level)}>
      <Link
        to={`/place/${encodeURIComponent(pin.id)}`}
        className="pc-hit"
        aria-label={`Open ${pin.name}`}
      >
        <span className="pc-name">{pin.name}</span>
        <span className="pc-detail">{pin.detail ?? 'Delhi NCR'}</span>
        <span className="pc-aqi">
          <strong className="tnum">{reading.aqi}</strong>
          <span>AQI</span>
        </span>
        <span className="pc-level">{level.name}</span>
        <span className="pc-sky">
          <span className="pc-sky-disc">
            <WeatherIcon condition={w.condition} isDay={w.isDay} size={18} />
          </span>
          <span className="tnum">{w.tempC}°</span>
          <span className="sr-only">{CONDITION_LABELS[w.condition]}</span>
        </span>
        <SmokeSquare pm25={reading.pm25} compact className="pc-smoke" />
        <span className="pc-face" aria-hidden="true">
          <FaceIcon face={level.face} size={open ? 88 : 66} />
        </span>
      </Link>
      <div className="pc-actions">
        <button
          type="button"
          className="pc-icon-button"
          aria-label={open ? `Fold ${pin.name}` : `Show ${pin.name} for three days`}
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => {
            setOpen((v) => !v);
          }}
        >
          <ChevronDown
            size={20}
            strokeWidth={2.25}
            aria-hidden="true"
            className={open ? 'flip' : ''}
          />
        </button>
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
      {open && (
        <div className="pc-more" id={detailId}>
          <ul className="pc-days" aria-label="Today and the next two days">
            {reading.daily.slice(0, 3).map((day, index) => (
              <li key={day.date}>
                <span className="pc-day-name">{index === 0 ? 'Today' : weekday(day.date)}</span>
                <AqiChip aqi={day.aqi} />
                <WeatherIcon condition={day.condition} isDay size={22} />
                <span className="tnum pc-day-temps">
                  {day.hiC}° <span className="pc-lo">{day.loC}°</span>
                </span>
                <span className="tnum pc-day-rain">
                  <Droplet size={13} strokeWidth={2} className="ic-drop" aria-hidden="true" />
                  {day.rainChancePct}%
                </span>
              </li>
            ))}
          </ul>
          <p className="pc-source">
            Sample data · {p.stationName}, {p.distanceKm} km · {age(p.ageMinutes)}
          </p>
        </div>
      )}
    </li>
  );
}
