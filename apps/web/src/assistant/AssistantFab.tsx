import { Mic, SendHorizontal, Sparkles, Store, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { alertsFor } from '../alerts/model';
import { useFires } from '../alerts/useFires';
import { useHousehold } from '../exposure/useExposure';
import { readDemo } from '../demo/state';
import { airStore, useToday } from '../air/store';
import { API_URL } from '../config';
import { usePins } from '../places/usePins';
import { Pill } from '../today/ui/Chip';
import { apiAssistant } from './api';
import { buildContext } from './context';
import { localAssistant } from './local';
import { RequestForm } from './RequestForm';
import { addedText, parseOuting } from './outingParse';
import { today } from '../exposure/model';
import { addOuting, loadOutings, newOuting, saveOutings } from '../exposure/outings';
import { loadHousehold } from '../exposure/people';
import { nowMinutes } from '../exposure/ui/OutingSheet';
import { loadPins } from '../data/pins';
import { canListen, canSpeak, listen, speak, stopSpeaking } from './speech';
import type { AssistantContext, AssistantSource } from './types';

interface Message {
  readonly id: number;
  readonly from: 'you' | 'vayu';
  readonly text: string;
  readonly basis?: string;
  readonly audioUrl?: string;
}

const SUGGESTIONS = [
  'When can I go for a walk?',
  'Is school safe today?',
  'Do I need a mask?',
  'What alerts are coming?',
] as const;

const GREETING =
  'Ask about a walk, school, masks, windows, alerts or stubble burning. Or tell me what someone did outdoors, like “Asha walked in the park for 40 minutes”, and I will add it to their day.';

/** The deployed app asks our API; the prototype and the tests answer from the rules alone. */
const configured = (): AssistantSource =>
  airStore().kind === 'live' ? apiAssistant(API_URL) : localAssistant;

/**
 * A button that stays on every screen and opens a chat. It answers questions such as "when can I go for a
 * walk" or "is school safe today" from the air, the alerts and the people being tracked. It can read answers
 * aloud and take a question by voice. The words will come from Amazon Bedrock and the voice from Amazon Polly
 * once our API serves them; until then this uses local answers and the browser's voice.
 */
export function AssistantFab({
  source = configured(),
}: {
  readonly source?: AssistantSource;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [view, setView] = useState<'chat' | 'request'>('chat');
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const next = useRef(1);
  const { pins } = usePins();
  const { household } = useHousehold();
  const fires = useFires();
  const first = pins[0];

  const state = useToday(first);
  const reading = state?.status === 'ready' ? state.data : undefined;
  const context = useMemo<AssistantContext | undefined>(() => {
    if (first === undefined || reading === undefined) return undefined;
    return buildContext(first.name, reading, alertsFor(reading, fires), fires, household.people);
  }, [first, reading, fires, household.people]);

  useEffect(() => {
    if (open) input.current?.focus();
    else stopSpeaking();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy]);

  const staged = useRef(readDemo()?.ask);
  const asked = useRef(false);

  const ask = (question: string): void => {
    const text = question.trim();
    if (text === '' || busy) return;
    const id = next.current++;
    setMessages((m) => [...m, { id, from: 'you', text }]);
    setDraft('');
    // Something someone did outdoors is added to their day, not answered.
    const people = loadHousehold(window.localStorage).people;
    const logged = parseOuting(text, people, loadPins(window.localStorage), {
      date: today(),
      minutes: nowMinutes(),
    });
    if (logged !== undefined) {
      let reply: string;
      if (logged.kind === 'add') {
        const mine = loadOutings(window.localStorage, logged.person.id);
        saveOutings(
          window.localStorage,
          logged.person.id,
          addOuting(mine, newOuting(logged.outing, mine)),
        );
        reply = addedText(logged.person, logged.outing);
      } else reply = logged.text;
      setMessages((m) => [
        ...m,
        {
          id: next.current++,
          from: 'vayu',
          text: reply,
          basis: logged.kind === 'add' ? 'Added to Exposure' : 'Outdoor time',
        },
      ]);
      return;
    }
    if (context === undefined) {
      setMessages((m) => [
        ...m,
        {
          id: next.current++,
          from: 'vayu',
          text:
            first === undefined
              ? 'Pin a place on My Air first, so there is some air to talk about.'
              : state?.status === 'error'
                ? 'We could not get the air just now, so I have nothing to go on. Please try again in a moment.'
                : 'Still getting the air for your first place. Ask again in a moment.',
        },
      ]);
      return;
    }
    setBusy(true);
    source.ask(text, context).then(
      (answer) => {
        setMessages((m) => [
          ...m,
          {
            id: next.current++,
            from: 'vayu',
            text: answer.text,
            basis: answer.basis,
            ...(answer.audioUrl === undefined ? {} : { audioUrl: answer.audioUrl }),
          },
        ]);
        setBusy(false);
      },
      () => {
        setMessages((m) => [
          ...m,
          {
            id: next.current++,
            from: 'vayu',
            text: 'No answer just now. Please try again in a moment.',
          },
        ]);
        setBusy(false);
      },
    );
  };

  // A demo scenario can open the chat and put a question as soon as the app shows.
  const stagedQuestion = staged.current;
  useEffect(() => {
    if (stagedQuestion === undefined || asked.current || context === undefined) return undefined;
    asked.current = true;
    setOpen(true);
    const timer = window.setTimeout(() => {
      ask(stagedQuestion);
    }, 900);
    return () => {
      window.clearTimeout(timer);
      asked.current = false;
    };
    // The question is put once, when the context is first known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context === undefined]);

  const byVoice = (): void => {
    setListening(true);
    void listen().then((heard) => {
      setListening(false);
      if (heard !== undefined && heard !== '') ask(heard);
    });
  };

  return (
    <>
      <button
        type="button"
        className="assistant-fab"
        aria-label="Vayu assistant"
        aria-haspopup="dialog"
        onClick={() => {
          setView('chat');
          setOpen(true);
        }}
      >
        <Sparkles size={22} strokeWidth={1.75} aria-hidden="true" />
        <span>Assistant</span>
      </button>
      {open && (
        <div
          className="sheet-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          <div
            className="sheet assistant"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assistant-title"
          >
            <div className="sheet-head">
              <div>
                <h2 id="assistant-title">Vayu assistant</h2>
                <p className="muted small">
                  <Pill>Sample data</Pill> Answers use today’s sample air. Bedrock and Polly plug in
                  here.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => {
                  setOpen(false);
                }}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            {view === 'chat' ? (
              <>
                <div className="chat" aria-live="polite">
                  <p className="bubble vayu">{GREETING}</p>
                  {messages.map((m) => (
                    <div key={m.id} className={`bubble ${m.from}`}>
                      <p>{m.text}</p>
                      {m.from === 'vayu' && m.basis !== undefined && (
                        <p className="small muted bubble-foot">
                          {m.basis}
                          {canSpeak() || m.audioUrl !== undefined ? (
                            <button
                              type="button"
                              className="link-button"
                              aria-label="Listen to this answer"
                              onClick={() => {
                                speak(m.text, m.audioUrl);
                              }}
                            >
                              <Volume2 size={14} aria-hidden="true" /> Listen
                            </button>
                          ) : null}
                        </p>
                      )}
                    </div>
                  ))}
                  {busy && <p className="bubble vayu muted">Checking the monitors nearby…</p>}
                  <div ref={end} />
                </div>
                <section className="ask-cta" aria-label="Get Vayu at your place">
                  <Store size={22} strokeWidth={1.75} aria-hidden="true" />
                  <span>
                    <strong>Want Vayu at your school, society or home?</strong>
                    <span className="muted small">
                      Ask for a demo, or for air monitors at your place.
                    </span>
                  </span>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      setView('request');
                    }}
                  >
                    Request
                  </button>
                </section>
                <div className="chips" role="group" aria-label="Suggested questions">
                  {[
                    ...SUGGESTIONS,
                    ...loadHousehold(window.localStorage)
                      .people.filter((p) => p.id !== 'me')
                      .slice(0, 1)
                      .map((p) => `${p.name} walked in the park for 30 minutes`),
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="choice"
                      onClick={() => {
                        ask(q);
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <form
                  className="ask-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    ask(draft);
                  }}
                >
                  <label className="sr-only" htmlFor="ask-input">
                    Your message
                  </label>
                  <input
                    id="ask-input"
                    ref={input}
                    value={draft}
                    placeholder="Ask, or tell me something"
                    autoComplete="off"
                    onChange={(event) => {
                      setDraft(event.target.value);
                    }}
                  />
                  {canListen() && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={listening ? 'Listening…' : 'Speak to the assistant'}
                      aria-pressed={listening}
                      onClick={byVoice}
                    >
                      <Mic size={20} aria-hidden="true" />
                    </button>
                  )}
                  <button type="submit" className="primary send" aria-label="Send" disabled={busy}>
                    <SendHorizontal size={18} aria-hidden="true" />
                  </button>
                </form>
              </>
            ) : (
              <RequestForm
                onBack={() => {
                  setView('chat');
                }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
