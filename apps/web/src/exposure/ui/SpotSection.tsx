import {
  Briefcase,
  GraduationCap,
  House,
  Plus,
  Sprout,
  Trash2,
  TreePine,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PlaceMatch } from '../../data/geocode';
import type { Pin } from '../../data/pins';
import type { Device } from '../../devices/devices';
import { pinId } from '../../data/pins';
import { PlaceSearch } from '../../places/ui/PlaceSearch';
import { INDOOR_SHARE } from '../assumptions';
import { DEFAULT_HOURS, SPOT_LABELS, type Spot, type SpotKind } from '../spots';

const ICONS: Readonly<Record<SpotKind, LucideIcon>> = {
  home: House,
  work: Briefcase,
  school: GraduationCap,
  outdoor: TreePine,
};

const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

function HourSelect({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (hour: number) => void;
}): React.JSX.Element {
  return (
    <label className="field inline">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      >
        {Array.from({ length: 25 }, (_, h) => (
          <option key={h} value={h}>
            {hourLabel(h)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** One kind of place: set it, change the hours you are usually there, see what is assumed about it. */
export function SpotSection({
  kind,
  spot,
  pins,
  devices,
  onSet,
  onClear,
  onAddPin,
  search,
}: {
  readonly kind: SpotKind;
  readonly spot: Spot | undefined;
  readonly pins: readonly Pin[];
  readonly devices: readonly Device[];
  readonly onSet: (spot: Spot) => void;
  readonly onClear: () => void;
  readonly onAddPin: (place: PlaceMatch) => void;
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
}): React.JSX.Element {
  const [picking, setPicking] = useState(false);
  const label = SPOT_LABELS[kind];
  const Icon = ICONS[kind];
  const monitor = devices.find((device) => device.where === kind);

  const choose = (pin: Pin): void => {
    onSet({ pin, ...DEFAULT_HOURS[kind], ...(kind === 'outdoor' ? { trees: true } : {}) });
    setPicking(false);
  };

  if (spot === undefined) {
    return (
      <section className="spot" aria-label={label}>
        <h2 className="spot-title">{label}</h2>
        {picking ? (
          <div className="picker">
            <p className="muted small">Pick one of your places, or search for another.</p>
            <ul className="choice-row">
              {pins.map((pin) => (
                <li key={pin.id}>
                  <button
                    type="button"
                    className="choice"
                    onClick={() => {
                      choose(pin);
                    }}
                  >
                    {pin.name}
                  </button>
                </li>
              ))}
            </ul>
            <PlaceSearch
              {...(search !== undefined ? { search } : {})}
              onPick={(match) => {
                onAddPin(match);
                choose({
                  id: pinId(match.lat, match.lng),
                  name: match.name,
                  ...(match.detail === '' ? {} : { detail: match.detail }),
                  lat: match.lat,
                  lng: match.lng,
                });
              }}
            />
            <button
              type="button"
              className="plain"
              onClick={() => {
                setPicking(false);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="dashed"
            onClick={() => {
              setPicking(true);
            }}
          >
            <span className="dashed-icon">
              <Plus size={20} strokeWidth={2} aria-hidden="true" />
            </span>
            Set {label}
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="spot spot-set" aria-label={label}>
      <div className="spot-head">
        <span className="dc-icon">
          <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <h2 className="spot-title">{label}</h2>
          <p className="muted small">
            {spot.pin.name}
            {spot.pin.detail === undefined ? '' : `, ${spot.pin.detail}`}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={`Remove ${label}`}
          onClick={onClear}
        >
          <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <div className="hours-row">
        <HourSelect
          label={`${label} from`}
          value={spot.from}
          onChange={(from) => {
            onSet({ ...spot, from });
          }}
        />
        <HourSelect
          label={`${label} until`}
          value={spot.to}
          onChange={(to) => {
            onSet({ ...spot, to });
          }}
        />
      </div>
      {kind === 'outdoor' ? (
        <label className="check">
          <input
            type="checkbox"
            checked={spot.trees === true}
            onChange={(event) => {
              onSet({ ...spot, trees: event.target.checked });
            }}
          />
          <Sprout size={18} strokeWidth={1.75} aria-hidden="true" />
          Trees around. Assumed to cut exposure a little.
        </label>
      ) : monitor !== undefined ? (
        <p className="small">
          <strong>{monitor.name}</strong> is here, so the indoor reading is used (sample for now).
        </p>
      ) : (
        <p className="small muted">
          No monitor here, so indoor air is assumed at {String(Math.round(INDOOR_SHARE * 100))}% of
          outside. <Link to="/?tab=devices">Add a monitor</Link>
        </p>
      )}
    </section>
  );
}
