import { Flame, X } from 'lucide-react';
import { useState } from 'react';
import { airStore } from '../air/store';
import { API_URL } from '../config';
import {
  FIRE_REPORT_WORDS,
  sentWords,
  submitFireReport,
  type FireReportDraft,
  type FireReportSent,
} from './fireReport';

/** The deployed app sends to our API; the prototype and the tests keep it on the device. */
const reportUrl = (): string | undefined => (airStore().kind === 'live' ? API_URL : undefined);

/**
 * Report a fire: where it is (and what the satellite saw, if it was picked on the map), a line to add if the person
 * likes, and what happens to it said plainly.
 */
export function FireReportSheet({
  fire,
  onClose,
  send = (draft) => submitFireReport(draft, { baseUrl: reportUrl() }),
}: {
  readonly fire: FireReportDraft;
  readonly onClose: () => void;
  readonly send?: (draft: FireReportDraft) => Promise<FireReportSent>;
}): React.JSX.Element {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [done, setDone] = useState<FireReportSent | undefined>(undefined);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setProblem('');
    try {
      setDone(await send({ ...fire, ...(note.trim() === '' ? {} : { note }) }));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
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
      <div className="sheet fire-report" role="dialog" aria-modal="true" aria-label="Report a fire">
        <div className="sheet-head">
          <h2>
            <Flame size={20} aria-hidden="true" /> Report a fire
          </h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {done === undefined ? (
          <>
            <p>
              At {fire.lat.toFixed(3)}°N, {fire.lng.toFixed(3)}°E
              {fire.hoursAgo === undefined
                ? '.'
                : `, seen by the satellite about ${String(fire.hoursAgo)} h ago.`}
            </p>
            <label className="field">
              <span>Anything to add? (optional)</span>
              <textarea
                value={note}
                maxLength={200}
                rows={3}
                placeholder="For example: smoke is drifting over the road"
                onChange={(event) => {
                  setNote(event.target.value);
                }}
              />
            </label>
            <p className="muted small">{FIRE_REPORT_WORDS}</p>
            {problem !== '' && (
              <p className="form-error" role="alert">
                {problem}
              </p>
            )}
            <button
              type="button"
              className="primary-link"
              disabled={busy}
              onClick={() => {
                void submit();
              }}
            >
              {busy ? 'Sending…' : 'Send the report'}
            </button>
          </>
        ) : (
          <>
            <p role="status">{sentWords(done)}</p>
            <button type="button" className="primary-link" onClick={onClose}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
