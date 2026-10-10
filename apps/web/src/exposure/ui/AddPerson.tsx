import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { WEEKDAYS } from '../calendar';
import { DAY_LABELS, defaultDayFor, personaOf, type Day } from '../people';
import { sampleSpotsFor, type Spot, type Spots } from '../spots';
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
}: {
  readonly onAdd: (person: { name: string; age: number; day: Day }, spots: Spots) => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [chosen, setChosen] = useState<Day | undefined>(undefined);
  const [edited, setEdited] = useState<{ from?: number; to?: number; days?: readonly number[] }>(
    {},
  );
  const [problem, setProblem] = useState('');

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
  const usual = sampleSpotsFor(personaOf({ day }));
  const base = day === 'none' ? undefined : usual[day];
  const from = edited.from ?? base?.from ?? 9;
  const to = edited.to ?? base?.to ?? 17;
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
    const spots: Partial<Record<'home' | 'school' | 'work', Spot>> = {};
    if (usual.home !== undefined) spots.home = usual.home;
    if (day !== 'none' && base !== undefined) spots[day] = { ...base, from, to, days };
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
        {day !== 'none' && (
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
        <p className="muted small">
          The rest of the time we assume they are at home. Time outdoors you log later, so it counts
          where they really were.
        </p>
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
