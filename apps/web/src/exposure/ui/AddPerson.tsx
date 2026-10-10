import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DAY_LABELS, defaultDayFor, personaOf, type Day } from '../people';
import { SPOT_LABELS, sampleSpotsFor, type Spot, type SpotKind, type Spots } from '../spots';

const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

function Hours({
  label,
  from,
  to,
  onChange,
}: {
  readonly label: string;
  readonly from: number;
  readonly to: number;
  readonly onChange: (from: number, to: number) => void;
}): React.JSX.Element {
  const options = Array.from({ length: 25 }, (_, h) => (
    <option key={h} value={h}>
      {hourLabel(h)}
    </option>
  ));
  return (
    <div className="hours-line">
      <span className="hours-name">{label}</span>
      <label className="field inline">
        <span>{label} from</span>
        <select
          value={from}
          onChange={(event) => {
            onChange(Number(event.target.value), to);
          }}
        >
          {options}
        </select>
      </label>
      <label className="field inline">
        <span>{label} until</span>
        <select
          value={to}
          onChange={(event) => {
            onChange(from, Number(event.target.value));
          }}
        >
          {options}
        </select>
      </label>
    </div>
  );
}

/**
 * A short form for someone else: a name, an age, where their day goes, and the hours they usually spend at
 * home, at school or work, and outdoors. The hours start from what is usual for that kind of day.
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
  const [edited, setEdited] = useState<Partial<Record<SpotKind, { from: number; to: number }>>>({});
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
  const kinds = (['home', day === 'none' ? undefined : day, 'outdoor'] as const).filter(
    (k): k is SpotKind => k !== undefined,
  );
  const hoursOf = (kind: SpotKind): { from: number; to: number } =>
    edited[kind] ?? { from: usual[kind]?.from ?? 9, to: usual[kind]?.to ?? 17 };

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
    const spots: Partial<Record<SpotKind, Spot>> = {};
    for (const kind of kinds) {
      const base = usual[kind];
      if (base !== undefined) spots[kind] = { ...base, ...hoursOf(kind) };
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
          Track someone you look after. Their day follows their age to begin with, and every hour
          can be changed.
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
          <legend>Where does the day go?</legend>
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
        {kinds.map((kind) => {
          const h = hoursOf(kind);
          return (
            <Hours
              key={`${day}-${kind}`}
              label={kind === 'outdoor' ? 'Park or walk' : SPOT_LABELS[kind]}
              from={h.from}
              to={h.to}
              onChange={(from, to) => {
                setEdited((current) => ({ ...current, [kind]: { from, to } }));
              }}
            />
          );
        })}
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
