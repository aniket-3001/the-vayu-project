import { LocateFixed } from 'lucide-react';
import { useLiveLocation } from '../places/liveLocation';

const NOTES = {
  refused: 'Your browser did not share your location, so detection is off.',
  unavailable: 'This browser cannot share a location.',
} as const;

/**
 * Detect my location: one switch for live location, wherever it is wanted on a screen. On, the app follows the
 * device while the page is open; off, only the places you set count. It says plainly when the browser refused.
 */
export function DetectLocation({
  className = '',
}: {
  readonly className?: string;
}): React.JSX.Element {
  const { enabled, status, set } = useLiveLocation();
  const on = enabled && status !== 'refused' && status !== 'unavailable';
  const note = status === 'refused' || status === 'unavailable' ? NOTES[status] : undefined;
  return (
    <span className={`detect ${className}`.trim()}>
      <button
        type="button"
        className={`detect-button${on ? ' on' : ''}${status === 'asking' ? ' asking' : ''}`}
        aria-pressed={on}
        onClick={() => {
          set(!on);
        }}
      >
        <LocateFixed size={18} strokeWidth={2} aria-hidden="true" />
        <span>
          {status === 'asking' ? 'Finding you…' : on ? 'Following you' : 'Detect my location'}
        </span>
      </button>
      {note !== undefined && (
        <span className="muted small" role="status">
          {note}
        </span>
      )}
    </span>
  );
}
