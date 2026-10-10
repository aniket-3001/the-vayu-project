import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { WEEKDAYS } from '../calendar';
import { DAY_LABELS, defaultDayFor, type Day } from '../people';
import type { PlaceMatch } from '../../data/geocode';
import type { Pin } from '../../data/pins';
import { DEFAULT_HOURS, type Spot, type SpotKind, type Spots } from '../spots';
import { PlacePicker } from './PlacePicker';
import { PlaceSlot, SLOT_NAMES } from './PlaceSlot';
import { DaysPicker } from './SpotSection';

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

/**
 * A short form for someone else: a name, an age, and whether their day goes to school or to work, with the
 * hours and the days of the week. The rest of the time they are assumed to be at home, and any time they
 * spend outdoors is logged afterwards, from their page or by telling the assistant.
 */
export function AddPerson({
  onAdd,
  onClose,
  pins = [],
  onAddPin,
  search,
}: {
  readonly onAdd: (person: { name: string; age: number; day: Day }, spots: Spots) => void;
  readonly onClose: () => void;
  /** The places already pinned, offered when picking where something is. */
  readonly pins?: readonly Pin[];
  readonly onAddPin?: (place: PlaceMatch) => void;
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [chosen, setChosen] = useState<Day | undefined>(undefined);
  const [edited, setEdited] = useState<{ from?: number; to?: number; days?: readonly number[] }>(
    {},
  );
  const [problem, setProblem] = useState('');
  // Where they spend the day: empty squares to fill in, nothing assumed.
  const [places, setPlaces] = useState<Partial<Record<SpotKind, Pin>>>({});
  const [picking, setPicking] = useState<SpotKind | undefined>(undefined);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const years = Number(age);
  const day: Day =
    chosen ?? (age === '' || !Number.isFinite(years) ? 'work' : defaultDayFor(years));
  const usual = day === 'none' ? undefined : DEFAULT_HOURS[day];
  const from = edited.from ?? usual?.from ?? 9;
  const to = edited.to ?? usual?.to ?? 17;
  const kinds: readonly SpotKind[] =
    day === 'none' ? ['home', 'outdoor'] : ['home', day, 'outdoor'];
  const days = edited.days ?? WEEKDAYS;
  const dayLabel = day === 'school' ? 'School' : 'Work';

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (name.trim() === '') {
      setProblem('Please give them a name.');
      return;
    }
    if (age === '' || !Number.isFinite(years) || years < 0 || years > 110) {
      setProblem('Please give an age between 0 and 110.');
      return;
    }
    if (day !== 'none' && days.length === 0) {
      setProblem(`Please pick at least one day for ${dayLabel.toLowerCase()}.`);
      return;
    }
    // Only what was filled in becomes a place; the rest stay empty to be set later.
    const spots: Partial<Record<SpotKind, Spot>> = {};
    for (const kind of kinds) {
      const pin = places[kind];
      if (pin === undefined) continue;
      spots[kind] =
        kind === 'work' || kind === 'school'
          ? { pin, from, to, days }
          : { pin, ...DEFAULT_HOURS[kind] };
    }
    onAdd({ name: name.trim(), age: years, day }, spots);
  };

  return (
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <form
        noValidate
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-person-title"
        onSubmit={submit}
      >
        <div className="sheet-head">
          <h2 id="add-person-title">Add a person</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <p className="muted small">
          Track someone you look after. Just their school or work hours and days.
        </p>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        <label className="field">
          <span>Age</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={110}
            value={age}
            onChange={(event) => {
              setAge(event.target.value);
            }}
          />
        </label>
        <fieldset className="field">
          <legend>Goes to</legend>
          <div className="choice-row">
            {(['school', 'work', 'none'] as const).map((d) => (
              <button
                key={d}
                type="button"
                className="choice"
                aria-pressed={day === d}
                onClick={() => {
                  setChosen(d);
                  setEdited({});
                }}
              >
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>
        </fieldset>
        {day !== 'none' && places[day] !== undefined && (
          <>
            <div className="hours-row">
              <HourSelect
                label={`${dayLabel} from`}
                value={from}
                onChange={(h) => {
                  setEdited((e) => ({ ...e, from: h }));
                }}
              />
              <HourSelect
                label={`${dayLabel} until`}
                value={to}
                onChange={(h) => {
                  setEdited((e) => ({ ...e, to: h }));
                }}
              />
            </div>
            <DaysPicker
              label={dayLabel}
              days={days}
              onChange={(next) => {
                setEdited((e) => ({ ...e, days: next }));
              }}
            />
          </>
        )}
        <fieldset className="field">
          <legend>Where they spend the day</legend>
          <div className="slots">
            {kinds.map((kind) => (
              <PlaceSlot
                key={kind}
                kind={kind}
                pin={places[kind]}
                active={picking === kind}
                onPress={() => {
                  setPicking(picking === kind ? undefined : kind);
                }}
              />
            ))}
          </div>
          {picking !== undefined && (
            <PlacePicker
              name={SLOT_NAMES[picking]}
              pins={pins}
              {...(onAddPin !== undefined ? { onAddPin } : {})}
              {...(search !== undefined ? { search } : {})}
              onPick={(pin) => {
                setPlaces((current) => ({ ...current, [picking]: pin }));
                setPicking(undefined);
              }}
              onCancel={() => {
                setPicking(undefined);
              }}
            />
          )}
          <p className="muted small">
            Tap a square to say where. Anything left empty can be set later. Time outdoors you log
            afterwards, so it counts where they really were.
          </p>
        </fieldset>
        {problem !== '' && (
          <p className="banner" role="alert">
            {problem}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="primary">
            Add person
          </button>
          <button type="button" className="plain" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
