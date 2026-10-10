import { RotateCw } from 'lucide-react';

/** A calm "still loading" line, so a screen is never blank while the air comes in. */
export function AirLoading({ what = 'the air' }: { readonly what?: string }): React.JSX.Element {
  return (
    <p className="air-state" role="status" aria-live="polite">
      <span className="air-pulse" aria-hidden="true" /> Getting {what}…
    </p>
  );
}

/** What went wrong in words, with a way to try again. Never a blank screen, never an invented number. */
export function AirError({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <div className="air-state air-error" role="alert">
      <p>
        <strong>We could not get the air just now.</strong> {message}
      </p>
      <button type="button" className="plain" onClick={onRetry}>
        <RotateCw size={14} aria-hidden="true" /> Try again
      </button>
    </div>
  );
}
