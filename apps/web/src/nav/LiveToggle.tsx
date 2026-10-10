import { LocateFixed } from 'lucide-react';
import { useLiveLocation } from '../places/liveLocation';

const WORDS = {
  off: 'Live location is off. Turn it on to see the air where you are.',
  asking: 'Asking for your location…',
  on: 'Live location is on. The air follows you while this page is open.',
  refused: 'Your browser did not share your location, so live location is off.',
  unavailable: 'This browser cannot share a location.',
} as const;

/**
 * Live location, on every screen: a switch that is remembered between visits. On, the app shows the air where the
 * device is and keeps it up to date; off, only the places you pinned.
 */
export function LiveToggle(): React.JSX.Element {
  const { enabled, status, set } = useLiveLocation();
  const on = enabled && status !== 'refused' && status !== 'unavailable';
  const note = status === 'refused' || status === 'unavailable' ? WORDS[status] : undefined;
  return (
    <>
      {note !== undefined && (
        <span className="dock-note" role="status">
          {note}
        </span>
      )}
      <button
        type="button"
        className={`smoke-toggle live-toggle${on ? ' on' : ''}${status === 'asking' ? ' asking' : ''}`}
        aria-pressed={on}
        aria-label="Live location"
        title={WORDS[on ? (status === 'asking' ? 'asking' : 'on') : 'off']}
        onClick={() => {
          set(!on);
        }}
      >
        <LocateFixed size={22} strokeWidth={1.9} aria-hidden="true" />
        {on && <i className="live-dot" aria-hidden="true" />}
      </button>
    </>
  );
}
