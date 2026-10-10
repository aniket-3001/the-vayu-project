import { Check, LocateFixed, Pin as PinIcon } from 'lucide-react';
import { useState } from 'react';

const SUGGESTIONS = ['Home', 'School', 'Office', 'Park'] as const;

/**
 * Asked after “Detect me”: keep following where the device is (live), or pin this place under a name, such as
 * Office, so it stays put. Live is the one place that moves with you; a pin never does.
 */
export function HereSheet({
  onLive,
  onPin,
  onCancel,
  note,
}: {
  readonly onLive: () => void;
  readonly onPin: (label: string) => void;
  readonly onCancel: () => void;
  /** Said when the place is outside the area we cover. */
  readonly note?: string;
}): React.JSX.Element {
  const [label, setLabel] = useState('');
  const clean = label.trim();
  return (
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <div className="sheet here-sheet" role="dialog" aria-modal="true" aria-label="Where you are">
        <h2>Found you</h2>
        <p className="muted">Keep this live, or pin it as a place with a name.</p>
        {note !== undefined && <p className="small">{note}</p>}
        <button type="button" className="here-live" onClick={onLive}>
          <LocateFixed size={22} strokeWidth={1.9} aria-hidden="true" />
          <span>
            <strong>Live</strong>
            <span className="muted small">
              Follows you and keeps updating while the app is open.
            </span>
          </span>
        </button>
        <form
          className="here-pin"
          onSubmit={(event) => {
            event.preventDefault();
            if (clean !== '') onPin(clean);
          }}
        >
          <p>
            <PinIcon size={18} strokeWidth={1.9} aria-hidden="true" />{' '}
            <strong>Pin this place</strong>
            <span className="muted small"> It stays where it is, with the name you give it.</span>
          </p>
          <div className="here-chips" role="group" aria-label="Suggested names">
            {SUGGESTIONS.map((name) => (
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
            <label className="sr-only" htmlFor="here-label">
              Name for this place
            </label>
            <input
              id="here-label"
              value={label}
              maxLength={40}
              placeholder="Or type a name"
              autoComplete="off"
              onChange={(event) => {
                setLabel(event.target.value);
              }}
            />
            <button type="submit" disabled={clean === ''}>
              <Check size={18} strokeWidth={2.25} aria-hidden="true" /> Pin it
            </button>
          </div>
        </form>
        <button type="button" className="plain" onClick={onCancel}>
          Not now
        </button>
      </div>
    </div>
  );
}
