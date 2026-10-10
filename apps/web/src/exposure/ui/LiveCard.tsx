import { LocateFixed } from 'lucide-react';
import type { LiveState } from '../useExposure';
import { Pill } from '../../today/ui/Chip';

const STATUS: Readonly<Record<LiveState, string>> = {
  off: 'Off.',
  asking: 'Asking your browser for your location…',
  on: 'On. Logging where you are while this page is open.',
  refused: 'Your browser did not give us your location, so nothing can be logged from it.',
  unavailable: 'This browser cannot share a location.',
};

/** Live location: your own track, worked out on this device and never sent anywhere. */
export function LiveCard({
  state,
  sample,
  hours,
  onStart,
  onStop,
  onSample,
  onClear,
}: {
  readonly state: LiveState;
  readonly sample: boolean;
  readonly hours: number;
  readonly onStart: () => void;
  readonly onStop: () => void;
  /** Shows a made-up day of movement. Left out in the deployed app. */
  readonly onSample?: () => void;
  readonly onClear: () => void;
}): React.JSX.Element {
  return (
    <section className="spot spot-set" aria-label="Live location">
      <div className="spot-head">
        <span className="dc-icon">
          <LocateFixed size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <h2 className="spot-title">Live location</h2>
          <p className="muted small" role="status">
            {sample ? 'Showing a made-up day of movement.' : STATUS[state]}
          </p>
        </div>
        {sample && <Pill>Sample track</Pill>}
      </div>
      <p className="small muted">
        Works out your exposure from where you actually are and how long you stay. It stays on this
        device. A web page can only log while it is open; the phone app will do it in the
        background.
      </p>
      <p className="small">
        {hours === 0
          ? 'No hours logged yet.'
          : `${String(hours)} ${hours === 1 ? 'hour' : 'hours'} logged today.`}
      </p>
      <div className="form-actions">
        {state === 'on' ? (
          <button type="button" className="primary" onClick={onStop}>
            Turn off live location
          </button>
        ) : (
          <button type="button" className="primary" onClick={onStart}>
            Use live location
          </button>
        )}
        {onSample !== undefined && (
          <button type="button" className="plain" onClick={onSample}>
            Show a sample day
          </button>
        )}
        {(hours > 0 || sample) && (
          <button type="button" className="plain" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
    </section>
  );
}
