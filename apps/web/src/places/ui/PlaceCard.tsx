import { Droplet, ExternalLink, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Pin } from '../../data/pins';
import { levelForAqi } from '../../design/levels';
import { weekday } from '../../today/time';
import { AqiChip } from '../../today/ui/Chip';
import { levelVars } from '../../today/ui/format';
import { CONDITION_LABELS, FaceIcon, WeatherIcon } from '../../today/ui/icons';
import { SmokeNote } from '../../units/AirUnits';
import { readingForPin } from '../placeSample';

const age = (minutes: number): string =>
  minutes < 60 ? `${String(minutes)} min ago` : `${String(Math.round(minutes / 60))} h ago`;

/**
 * One pinned place as a square in the colour of its air, so a row of them reads at a glance: the name, the
 * number, the face and the sky. Pressing it opens it out to the next two days and where the number came from.
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
      <button
        type="button"
        className="pc-hit"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <span className="pc-top">
          <span>
            <span className="pc-name">{pin.name}</span>
            <span className="pc-detail">{pin.detail ?? 'Delhi NCR'}</span>
          </span>
          <span className="pc-face">
            <FaceIcon face={level.face} size={open ? 44 : 38} />
          </span>
        </span>
        <span className="pc-aqi">
          <strong className="tnum">{reading.aqi}</strong>
          <span>AQI</span>
        </span>
        <span className="pc-foot">
          <span className="pc-level">{level.name}</span>
          <span className="pc-sky">
            <WeatherIcon condition={w.condition} isDay={w.isDay} size={18} />
            <span className="tnum">{w.tempC}°</span>
            <span className="sr-only">{CONDITION_LABELS[w.condition]}</span>
          </span>
          <SmokeNote pm25={reading.pm25} className="pc-smoke" short />
        </span>
      </button>
      <button
        type="button"
        className="pc-remove"
        aria-label={`Remove ${pin.name}`}
        onClick={() => {
          onRemove(pin);
        }}
      >
        <X size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div className="pc-more" id={detailId}>
          <ul className="pc-days" aria-label="Next two days">
            {reading.daily.slice(1, 3).map((day) => (
              <li key={day.date}>
                <span className="pc-day-name">{weekday(day.date)}</span>
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
          <Link to={`/place/${encodeURIComponent(pin.id)}`} className="pc-open">
            Open {pin.name} <ExternalLink size={14} aria-hidden="true" />
          </Link>
        </div>
      )}
    </li>
  );
}
