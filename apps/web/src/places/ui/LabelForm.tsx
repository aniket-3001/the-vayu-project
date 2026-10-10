import { Check } from 'lucide-react';
import { useState } from 'react';

/** The names most people give a place; anything else may be typed. */
export const LABEL_SUGGESTIONS = ['Home', 'School', 'Office', 'Park'] as const;

/**
 * Asks what to call a place: one of the usual names or any word of your own. Nothing is pinned until it has a name,
 * and the name is what the card, the Lens and the assistant call the place.
 */
export function LabelForm({
  onSave,
  submit = 'Pin it',
}: {
  readonly onSave: (label: string) => void;
  readonly submit?: string;
}): React.JSX.Element {
  const [label, setLabel] = useState('');
  const clean = label.trim();
  return (
    <form
      className="here-pin"
      onSubmit={(event) => {
        event.preventDefault();
        if (clean !== '') onSave(clean);
      }}
    >
      <div className="here-chips" role="group" aria-label="Suggested names">
        {LABEL_SUGGESTIONS.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={clean === name}
            onClick={() => {
              setLabel(name);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="here-name">
        <label className="sr-only" htmlFor="place-label">
          Name for this place
        </label>
        <input
          id="place-label"
          value={label}
          maxLength={40}
          placeholder="Or type a name, like Gym"
          autoComplete="off"
          onChange={(event) => {
            setLabel(event.target.value);
          }}
        />
        <button type="submit" disabled={clean === ''}>
          <Check size={18} strokeWidth={2.25} aria-hidden="true" /> {submit}
        </button>
      </div>
    </form>
  );
}
