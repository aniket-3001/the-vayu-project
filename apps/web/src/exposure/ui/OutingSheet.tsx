import { Bike, Footprints, MapPin, Trees, TreePine, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Pin } from '../../data/pins';
import { SAMPLE_AS_OF } from '../../today/sample';
import { hourOfDay } from '../../today/time';
import { TODAY, EARLIEST, formatDate, type DateKey } from '../model';
import {
  ACTIVITIES,
  ACTIVITY_LABELS,
  clockOf,
  problemWithOuting,
  type Activity,
  type Outing,
} from '../outings';
import type { Person } from '../people';

const ICONS: Readonly<Record<Activity, LucideIcon>> = {
  walk: Footprints,
  play: Trees,
  cycle: Bike,
  other: MapPin,
};
export const ActivityIcon = ({
  activity,
  size = 20,
}: {
  readonly activity: Activity;
  readonly size?: number;
}): React.JSX.Element => {
  const Icon = ICONS[activity];
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />;
};

/** The minutes after midnight at the moment the sample describes. */
export const NOW_MINUTES = Math.round(hourOfDay(SAMPLE_AS_OF) * 60);

const DURATIONS = [15, 30, 45, 60, 90, 120] as const;

const toMinutes = (clock: string): number => {
  const [h, m] = clock.split(':');
  return Number(h) * 60 + Number(m);
};

/**
 * Logs time someone spent outdoors: what they did, where, when and for how long. For everyone but the person
 * holding the phone, whose outdoor time comes from their location. Counts in their exposure as outside air,
 * a little less if there were trees around, and says so.
 */
export function OutingSheet({
  person,
  pins,
  onSave,
  onClose,
}: {
  readonly person: Person;
  readonly pins: readonly Pin[];
  readonly onSave: (outing: Omit<Outing, 'id'>) => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const park = pins.find((p) => /park/iu.test(p.name)) ?? pins[0];
  const [activity, setActivity] = useState<Activity>('walk');
  const [pinId, setPinId] = useState(park?.id ?? '');
  const [date, setDate] = useState<DateKey>(TODAY);
  const [minutes, setMinutes] = useState(30);
  const [start, setStart] = useState(clockOf(Math.max(0, NOW_MINUTES - 60)));
  const [trees, setTrees] = useState(park !== undefined && /park/iu.test(park.name));
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

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const pin = pins.find((p) => p.id === pinId);
    if (pin === undefined) {
      setProblem('Please pick where it was.');
      return;
    }
    const found = problemWithOuting({ start: toMinutes(start), minutes }, date, TODAY, NOW_MINUTES);
    if (found !== undefined) {
      setProblem(found);
      return;
    }
    onSave({ date, start: toMinutes(start), minutes, activity, pin, trees });
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
        aria-labelledby="outing-title"
        onSubmit={submit}
      >
        <div className="sheet-head">
          <div>
            <h2 id="outing-title">
              <TreePine size={20} strokeWidth={1.75} aria-hidden="true" /> Outdoor time for{' '}
              {person.name}
            </h2>
            <p className="muted small">
              Where {person.name === 'Me' ? 'you were' : `${person.name} was`} outside, and for how
              long. It counts as outside air, a little less with trees around (assumed).
              {person.id === 'me'
                ? ' In hours when your location is on, your location counts.'
                : ''}
            </p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <fieldset className="field">
          <legend>What did they do?</legend>
          <div className="choice-row">
            {ACTIVITIES.map((a) => (
              <button
                key={a}
                type="button"
                className="choice with-icon"
                aria-pressed={activity === a}
                onClick={() => {
                  setActivity(a);
                }}
              >
                <ActivityIcon activity={a} size={18} /> {ACTIVITY_LABELS[a]}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>Where</span>
          <select
            value={pinId}
            onChange={(event) => {
              setPinId(event.target.value);
              const chosen = pins.find((p) => p.id === event.target.value);
              if (chosen !== undefined) setTrees(/park/iu.test(chosen.name));
            }}
          >
            {pins.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="hours-row">
          <label className="field inline">
            <span>Day</span>
            <input
              type="date"
              value={date}
              min={EARLIEST}
              max={TODAY}
              onChange={(event) => {
                if (event.target.value !== '') setDate(event.target.value);
              }}
            />
          </label>
          <label className="field inline">
            <span>Started at</span>
            <input
              type="time"
              value={start}
              onChange={(event) => {
                setStart(event.target.value);
              }}
            />
          </label>
        </div>
        <label className="field">
          <span>For how long</span>
          <select
            value={minutes}
            onChange={(event) => {
              setMinutes(Number(event.target.value));
            }}
          >
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${String(m)} minutes` : m === 60 ? '1 hour' : `${String(m / 60)} hours`}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={trees}
            onChange={(event) => {
              setTrees(event.target.checked);
            }}
          />
          Trees around. Assumed to cut exposure a little.
        </label>
        <p className="muted small">{formatDate(date)}</p>
        {problem !== '' && (
          <p className="banner" role="alert">
            {problem}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="primary">
            Add to {person.name}’s day
          </button>
          <button type="button" className="plain" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
