import { linkPurifier, purifierName, purifierPerformance } from '@vayu/unit';
import { useState } from 'react';
import { useUnitState } from '../useUnit';

/**
 * What the unit reads while it sits on the purifier: the air at the purifier's output, kept apart from the room's. It
 * names the purifier (asking once per tag), and says how much cleaner that air is than the room when the unit has
 * recently read both, and says it cannot compare, with no number, when it has not.
 */
export function PurifierPanel({ nowMs }: { readonly nowMs: number }): React.JSX.Element | null {
  const unit = useUnitState();
  const [typed, setTyped] = useState('');
  // Bumped after a name is saved, so the saved name is read again.
  const [, setSaved] = useState(0);
  const purified = unit.purified;
  if (!unit.onPurifier || purified === undefined) return null;
  const tag = purified.reading.purifierTag;
  const name = tag === undefined ? undefined : purifierName(window.localStorage, tag);
  const room = unit.latest;
  const result = purifierPerformance(
    room === undefined ? undefined : { pm25: room.reading.pm25, atMs: room.atMs },
    { pm25: purified.reading.pm25, atMs: purified.atMs },
    nowMs,
  );
  const pm = Math.round(purified.reading.pm25 * 10) / 10;
  return (
    <div className="room-grid">
      <section className="card room-purified" aria-labelledby="room-purified-title">
        <h2 id="room-purified-title">Purified air</h2>
        <p>
          {name === undefined ? '' : `${name}: `}PM2.5 {pm} µg/m³ at the purifier’s output
        </p>
        <p className="muted">
          {result === null
            ? 'Not enough to compare yet. Take the unit off the purifier for a few minutes, then put it back.'
            : `The purifier makes the air ${String(result.cleanerPct)}% cleaner than the room.`}
        </p>
        {name === undefined && tag !== undefined && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              linkPurifier(window.localStorage, tag, typed);
              setTyped('');
              setSaved((n) => n + 1);
            }}
          >
            <label className="field">
              Which purifier is this?
              <input
                type="text"
                value={typed}
                maxLength={40}
                onChange={(event) => {
                  setTyped(event.target.value);
                }}
              />
            </label>
            <button type="submit" className="primary">
              Save
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
