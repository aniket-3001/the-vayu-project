import { hourName } from '../../today/time';
import { Briefcase, GraduationCap, House, Trash2, TreePine, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PlaceMatch } from '../../data/geocode';
import type { Pin } from '../../data/pins';
import { PlacePicker } from './PlacePicker';
import { PlaceSlot, SLOT_NAMES } from './PlaceSlot';
import { INDOOR_SHARE } from '../assumptions';
import { unitNear, type Unit } from '../units';
import { DAY_INITIALS, DAY_NAMES, DAY_ORDER, WEEKDAYS } from '../calendar';
import { DEFAULT_HOURS, SPOT_LABELS, type Spot, type SpotKind } from '../spots';

const ICONS: Readonly<Record<SpotKind, LucideIcon>> = {
  home: House,
  work: Briefcase,
  school: GraduationCap,
  outdoor: TreePine,
};

const hourLabel = (hour: number): string => hourName(hour);

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

/** Which days of the week a school or work runs: seven small buttons. It is shut on public holidays too. */
export function DaysPicker({
  label,
  days,
  onChange,
}: {
  readonly label: string;
  readonly days: readonly number[];
  readonly onChange: (days: readonly number[]) => void;
}): React.JSX.Element {
  return (
    <fieldset className="days-picker">
      <legend>{label} days</legend>
      <div className="days-row">
        {DAY_ORDER.map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={days.includes(day)}
            aria-label={DAY_NAMES[day]}
            onClick={() => {
              onChange(days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort());
            }}
          >
            {DAY_INITIALS[day]}
          </button>
        ))}
      </div>
      <p className="muted small">Not on public holidays. The rest of the time: at home.</p>
    </fieldset>
  );
}

/** One kind of place: set it, change the hours you are usually there, see what is assumed about it. */
export function SpotSection({
  kind,
  spot,
  pins,
  units,
  onSet,
  onClear,
  onAddPin,
  search,
}: {
  readonly kind: SpotKind;
  readonly spot: Spot | undefined;
  readonly pins: readonly Pin[];
  /** Every Vayu unit that can help, the person's own and the shared ones. */
  readonly units: readonly Unit[];
  readonly onSet: (spot: Spot) => void;
  readonly onClear: () => void;
  readonly onAddPin: (place: PlaceMatch) => void;
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
}): React.JSX.Element {
  const [picking, setPicking] = useState(false);
  const label = SPOT_LABELS[kind];
  const Icon = ICONS[kind];
  const unit = spot === undefined ? undefined : unitNear(spot.pin, units);

  const choose = (pin: Pin): void => {
    onSet({ pin, ...DEFAULT_HOURS[kind] });
    setPicking(false);
  };

  if (spot === undefined) {
    return (
      <section className="spot" aria-label={label}>
        <h2 className="spot-title">{label}</h2>
        {picking ? (
          <PlacePicker
            name={SLOT_NAMES[kind]}
            pins={pins}
            onAddPin={onAddPin}
            {...(search !== undefined ? { search } : {})}
            onPick={choose}
            onCancel={() => {
              setPicking(false);
            }}
          />
        ) : (
          <PlaceSlot
            kind={kind}
            pin={undefined}
            active={false}
            onPress={() => {
              setPicking(true);
            }}
          />
        )}
      </section>
    );
  }

  return (
    <section className="spot spot-set" aria-label={label}>
      <div className="spot-head">
        <span className={`dc-icon spot-${kind}`}>
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
      {kind !== 'home' && (
        <>
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
          <DaysPicker
            label={label}
            days={spot.days ?? WEEKDAYS}
            onChange={(days) => {
              onSet({ ...spot, days });
            }}
          />
        </>
      )}
      {unit !== undefined ? (
        <p className="small">
          <strong>{unit.name}</strong> is here.{' '}
          {unit.own
            ? 'It is yours, so its indoor reading is used.'
            : 'It is not yours, and you did not have to add it: anyone here gets its reading.'}{' '}
          <span className="muted">(Sample for now.)</span>
        </p>
      ) : (
        <p className="small muted">
          No unit here, so indoor air is assumed at {String(Math.round(INDOOR_SHARE * 100))}% of
          outside. <Link to="/?tab=devices">Add a monitor</Link>
        </p>
      )}
    </section>
  );
}
