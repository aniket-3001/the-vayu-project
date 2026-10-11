import { writeUrl } from './writeUrl';
import { ArrowLeft, Check } from 'lucide-react';
import { useState } from 'react';
import { airStore } from '../air/store';
import { API_URL } from '../config';
import { weekActive } from '../week/active';
import {
  EMPTY_DRAFT,
  WANTS,
  WANT_LABELS,
  WHO,
  WHO_LABELS,
  problemsWith,
  submitRequest,
  type Draft,
  type Sent,
  type Want,
  type Who,
} from './requests';

/** The deployed app sends to our API; the prototype, the tests and the recorded days keep it on the device. */
const requestUrl = (): string | undefined =>
  writeUrl(airStore().kind === 'live', weekActive(), API_URL);

const ORG_LABELS: Readonly<Record<Exclude<Who, 'person'>, string>> = {
  school: 'School name',
  society: 'Society name',
};

/**
 * Asks for a demo or for monitors: who you are (a school, a society or a person), where, and how to reach you.
 * It asks for as little as it can and says what happens to it.
 */
export function RequestForm({
  onBack,
  send = (draft) => submitRequest(draft, { baseUrl: requestUrl() }),
}: {
  readonly onBack: () => void;
  readonly send?: (draft: Draft) => Promise<Sent>;
}): React.JSX.Element {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [problems, setProblems] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Sent | undefined>(undefined);
  const set = (patch: Partial<Draft>): void => {
    setDraft((d) => ({ ...d, ...patch }));
  };
  const toggleWant = (want: Want): void => {
    set({
      wants: draft.wants.includes(want)
        ? draft.wants.filter((w) => w !== want)
        : [...draft.wants, want],
    });
  };

  if (done !== undefined) {
    return (
      <div className="request-done" role="status">
        <span className="request-tick">
          <Check size={28} strokeWidth={3} aria-hidden="true" />
        </span>
        <h3>Thank you, {draft.name.trim()}.</h3>
        <p>
          {done === 'sent'
            ? 'Saved. No one is notified automatically: the request waits until the author reads it, so a reply may take days. If it is urgent, say so in the note.'
            : 'Your request is saved in this prototype. Nothing has been sent yet, because the request line to our team is not switched on.'}
        </p>
        <button type="button" className="primary" onClick={onBack}>
          Back to the chat
        </button>
      </div>
    );
  }

  return (
    <form
      className="request-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const found = problemsWith(draft);
        setProblems(found);
        if (found.length > 0) return;
        setBusy(true);
        send(draft).then(
          (result) => {
            setBusy(false);
            setDone(result);
          },
          (error: unknown) => {
            setBusy(false);
            setProblems([
              error instanceof Error
                ? error.message
                : 'That did not go through. Please try again in a moment.',
            ]);
          },
        );
      }}
    >
      <button type="button" className="link-button" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" /> Back to the chat
      </button>
      <h3>We would like Vayu at our place</h3>
      <p className="muted small">
        A short form. We keep it for 180 days and use it only to get back to you about a demo or
        monitors. Nothing is sent to anyone automatically.
      </p>

      <fieldset className="field">
        <legend>We are</legend>
        <div className="choice-row">
          {WHO.map((who) => (
            <button
              key={who}
              type="button"
              className="choice"
              aria-pressed={draft.who === who}
              onClick={() => {
                set({ who });
              }}
            >
              {WHO_LABELS[who]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Your name</span>
        <input
          value={draft.name}
          autoComplete="name"
          onChange={(event) => {
            set({ name: event.target.value });
          }}
        />
      </label>
      {draft.who !== 'person' && (
        <label className="field">
          <span>{ORG_LABELS[draft.who]}</span>
          <input
            value={draft.organisation}
            autoComplete="organization"
            onChange={(event) => {
              set({ organisation: event.target.value });
            }}
          />
        </label>
      )}
      <label className="field">
        <span>Area and city</span>
        <input
          value={draft.area}
          placeholder="For example, Dwarka, Delhi"
          autoComplete="address-level2"
          onChange={(event) => {
            set({ area: event.target.value });
          }}
        />
      </label>
      <label className="field">
        <span>Email or mobile number</span>
        <input
          value={draft.contact}
          autoComplete="email"
          onChange={(event) => {
            set({ contact: event.target.value });
          }}
        />
      </label>
      <label className="field">
        <span>
          {draft.who === 'school'
            ? 'How many classrooms (if you know)'
            : draft.who === 'society'
              ? 'How many blocks or common rooms (if you know)'
              : 'How many rooms (if you know)'}
        </span>
        <input
          value={draft.places}
          inputMode="numeric"
          onChange={(event) => {
            set({ places: event.target.value.replace(/\D/gu, '').slice(0, 4) });
          }}
        />
      </label>

      <fieldset className="field">
        <legend>We would like</legend>
        {WANTS.map((want) => (
          <label key={want} className="check">
            <input
              type="checkbox"
              checked={draft.wants.includes(want)}
              onChange={() => {
                toggleWant(want);
              }}
            />
            {WANT_LABELS[want]}
          </label>
        ))}
      </fieldset>

      {problems.length > 0 && (
        <div className="banner" role="alert">
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
