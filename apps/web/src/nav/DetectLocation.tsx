import { LocateFixed } from 'lucide-react';
import { GPS_OFF_WORDS, useGps } from '../places/gps';
import { useLiveLocation } from '../places/liveLocation';

const NOTES = {
  refused: 'Your browser did not share your location, so detection is off.',
  unavailable: 'This browser cannot share a location.',
} as const;

/**
 * Detect my location: one switch for live location, wherever it is wanted on a screen. On, the app uses the
 * device's position while the page is open; off, only the places you set count. It says plainly when the browser refused.
 */
export function DetectLocation({
  className = '',
}: {
  readonly className?: string;
}): React.JSX.Element {
  const { enabled, status, set } = useLiveLocation();
  const gps = useGps();
  const on = gps.on && enabled && status !== 'refused' && status !== 'unavailable';
  const note = !gps.on
    ? GPS_OFF_WORDS
    : status === 'refused' || status === 'unavailable'
      ? NOTES[status]
      : undefined;
  return (
    <span className={`detect ${className}`.trim()}>
      <button
        type="button"
        className={`detect-button${on ? ' on' : ''}${status === 'asking' ? ' asking' : ''}`}
        aria-pressed={on}
        disabled={!gps.on}
        onClick={() => {
          set(!on);
        }}
      >
        <LocateFixed size={18} strokeWidth={2} aria-hidden="true" />
        <span>
          {status === 'asking'
            ? 'Finding you…'
            : on
              ? 'Live location detected'
              : 'Detect my location'}
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
