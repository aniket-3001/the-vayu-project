import { Lock } from 'lucide-react';
import { weekActive } from './active';
import { RECORDING_NOTICE } from './protect';

/** On the recorded days only: says plainly that the recording is shared and cannot be changed, and what can be. */
export function RecordingNotice(): React.JSX.Element | null {
  if (!weekActive()) return null;
  return (
    <p className="recording-notice" role="note">
      <Lock size={16} strokeWidth={2} aria-hidden="true" /> {RECORDING_NOTICE}
    </p>
  );
}
