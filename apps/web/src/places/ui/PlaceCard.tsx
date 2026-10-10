import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Pin } from '../../data/pins';
import { levelForAqi } from '../../design/levels';
import { levelVars } from '../../today/ui/format';
import { CONDITION_LABELS, FaceIcon, WeatherIcon } from '../../today/ui/icons';
import { AqiChip } from '../../today/ui/Chip';
import { weekday } from '../../today/time';
import { readingForPin } from '../placeSample';

const age = (minutes: number): string =>
  minutes < 60 ? `${String(minutes)} min ago` : `${String(Math.round(minutes / 60))} h ago`;

/** One pinned place as a card in its air colour: name, the number, the sky, and where the number came from. */
export function PlaceCard({
  pin,
  onRemove,
}: {
  readonly pin: Pin;
  readonly onRemove: (pin: Pin) => void;
}): React.JSX.Element {
  const reading = readingForPin(pin);
  const level = levelForAqi(reading.aqi);
  const p = reading.provenance;
  const w = reading.weather;
  return (
    <li className="place-card" style={levelVars(level)}>
      <div className="pc-top">
        <div>
          <h2 className="pc-name">
            <Link to={`/place/${encodeURIComponent(pin.id)}`} className="pc-link">
              {pin.name}
            </Link>
          </h2>
          <p className="pc-detail">{pin.detail ?? 'Delhi NCR'}</p>
        </div>
        <button
          type="button"
          className="pc-remove"
          aria-label={`Remove ${pin.name}`}
          onClick={() => {
            onRemove(pin);
          }}
        >
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div className="pc-main">
        <span className="pc-face">
          <FaceIcon face={level.face} size={56} />
        </span>
        <div className="pc-words">
          <p className="pc-level">{level.name}</p>
          <p className="pc-sky">
            <WeatherIcon condition={w.condition} isDay={w.isDay} size={20} />
            <span className="tnum">{w.tempC}°C</span>
            <span aria-hidden="true">{CONDITION_LABELS[w.condition]}</span>
          </p>
        </div>
        <p className="pc-aqi">
          <strong className="tnum">{reading.aqi}</strong>
          <span>AQI</span>
        </p>
      </div>
      <ul className="pc-days" aria-label="Next three days">
        {reading.daily.slice(0, 3).map((day, index) => (
          <li key={day.date}>
            <span className="pc-day-name">{index === 0 ? 'Today' : weekday(day.date)}</span>
            <AqiChip aqi={day.aqi} />
            <span className="tnum pc-day-temps">
              {day.hiC}° <span className="pc-lo">{day.loC}°</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="pc-source">
        Sample data · {p.stationName}, {p.distanceKm} km · {age(p.ageMinutes)}
      </p>
    </li>
  );
}
