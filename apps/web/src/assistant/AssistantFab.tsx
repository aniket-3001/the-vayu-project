import { Mic, SendHorizontal, Sparkles, Store, Volume2, VolumeX, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { alertsFor } from '../alerts/model';
import { useFires } from '../alerts/useFires';
import { useHousehold } from '../exposure/useExposure';
import { readDemo } from '../demo/state';
import { airStore, useToday } from '../air/store';
import { API_URL } from '../config';
import { useLivePin } from '../places/liveLocation';
import { usePins } from '../places/usePins';
import { Pill } from '../today/ui/Chip';
import { apiAssistant } from './api';
import { buildContext } from './context';
import { localAssistant } from './local';
import { RequestForm } from './RequestForm';
import { addedText } from './outingParse';
import { isOutdoorStatement, nextStep, readInto, startDraft, type LogDraft } from './logging';
import { pinForRole, type Role } from '../places/roles';
import { today } from '../exposure/model';
import { addOuting, loadOutings, newOuting, saveOutings } from '../exposure/outings';
import { loadHousehold } from '../exposure/people';
import { nowMinutes } from '../exposure/ui/OutingSheet';
import { loadPins } from '../data/pins';
import {
  browserVoice,
  canListen,
  listenLive,
  pollyVoice,
  type Listening,
  type Voice,
} from './speech';
import type { AssistantContext, AssistantSource } from './types';

interface Message {
  readonly id: number;
  readonly from: 'you' | 'vayu';
  readonly text: string;
  readonly basis?: string;
  readonly audioUrl?: string;
  /** Short answers to tap, when the assistant has asked for something. */
  readonly chips?: readonly string[];
  /** Somewhere to go from this message, such as the Exposure screen after something was logged. */
  readonly link?: { readonly to: string; readonly label: string };
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

/** The deployed app reads answers in Amazon Polly's voice through our API; the prototype and the tests use the browser's. */
const configuredVoice = (): Voice =>
  airStore().kind === 'live' ? pollyVoice(API_URL) : browserVoice();

const VOICE_KEY = 'vayu.voice.v1';
const voiceWasOn = (): boolean => {
  try {
    return window.localStorage.getItem(VOICE_KEY) !== 'off';
  } catch {
    return true;
  }
};

/**
 * A button that stays on every screen and opens a chat. It answers questions such as "when can I go for a
 * walk" or "is school safe today" from the air, the alerts and the people being tracked. It can read answers
 * aloud and take a question by voice. The words will come from Amazon Bedrock and the voice from Amazon Polly
 * once our API serves them; until then this uses local answers and the browser's voice.
 */
export function AssistantFab({
  source = configured(),
  voice: given,
}: {
  readonly source?: AssistantSource;
  readonly voice?: Voice;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [spoken, setSpoken] = useState(voiceWasOn);
  const voice = useMemo(() => given ?? configuredVoice(), [given]);
  const hearing = useRef<Listening | undefined>(undefined);
  const [view, setView] = useState<'chat' | 'request'>('chat');
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const next = useRef(1);
  const { pins } = usePins();
  const { household } = useHousehold();
  // Where the device is, when live location is on; otherwise the first place pinned.
  const livePin = useLivePin();
  const first = livePin ?? pins[0];

  const state = useToday(first);
  const reading = state?.status === 'ready' ? state.data : undefined;
  // Only the fires that can reach this place: near it, or upwind of it.
  const fires = useFires(first, reading?.hourly[0]?.weather?.windFromDeg);
  const context = useMemo<AssistantContext | undefined>(() => {
    if (first === undefined || reading === undefined) return undefined;
    return buildContext(
      first.id === 'live' ? 'Your location' : first.name,
      reading,
      alertsFor(reading, fires),
      fires,
      household.people,
    );
  }, [first, reading, fires, household.people]);

  // The air at the school and at the work place too, so a question about either is answered from there.
  const schoolPin = pinForRole('school', pins);
  const workPin = pinForRole('work', pins);
  const schoolState = useToday(schoolPin);
  const workState = useToday(workPin);
  const schoolReading = schoolState?.status === 'ready' ? schoolState.data : undefined;
  const workReading = workState?.status === 'ready' ? workState.data : undefined;
  const schoolContext = useMemo<AssistantContext | undefined>(
    () =>
      schoolPin === undefined || schoolReading === undefined
        ? undefined
        : buildContext(
            schoolPin.name,
            schoolReading,
            alertsFor(schoolReading, fires),
            fires,
            household.people,
          ),
    [schoolPin, schoolReading, fires, household.people],
  );
  const workContext = useMemo<AssistantContext | undefined>(
    () =>
      workPin === undefined || workReading === undefined
        ? undefined
        : buildContext(
            workPin.name,
            workReading,
            alertsFor(workReading, fires),
            fires,
            household.people,
          ),
    [workPin, workReading, fires, household.people],
  );

  useEffect(() => {
    if (open) input.current?.focus();
    else {
      voice.stop();
      hearing.current?.cancel();
    }
  }, [open, voice]);
  // On a phone the keyboard covers the bottom of the page without resizing it. The sheet follows the part of the
  // screen that is really visible, so the message box stays above the keyboard.
  useEffect(() => {
    if (!open) return undefined;
    const viewport = window.visualViewport ?? undefined;
    if (viewport === undefined) return undefined;
    const root = document.documentElement;
    const follow = (): void => {
      root.style.setProperty('--vv-top', `${String(Math.round(viewport.offsetTop))}px`);
      root.style.setProperty('--vv-height', `${String(Math.round(viewport.height))}px`);
    };
    follow();
    viewport.addEventListener('resize', follow);
    viewport.addEventListener('scroll', follow);
    return () => {
      viewport.removeEventListener('resize', follow);
      viewport.removeEventListener('scroll', follow);
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-height');
    };
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
  const waitingFor = useRef<string | undefined>(undefined);
  const logging = useRef<LogDraft | undefined>(undefined);

  const ask = (question: string): void => {
    const text = question.trim();
    if (text === '' || busy) return;
    // From the tap itself, so the phone lets the answer be spoken when it arrives.
    voice.unlock?.();
    const id = next.current++;
    setMessages((m) => [...m, { id, from: 'you', text }]);
    setDraft('');
    // Something someone did outdoors is put together from what, where and for how long, asking for what is
    // missing, and then added to their day. It is not answered as a question.
    const people = loadHousehold(window.localStorage).people;
    const allPins = loadPins(window.localStorage);
    const clock = { date: today(), minutes: nowMinutes() };
    const say = (words: string, extra: Partial<Message> = {}): void => {
      setMessages((m) => [
        ...m,
        { id: next.current++, from: 'vayu', text: words, basis: 'Outdoor time', ...extra },
      ]);
      if (spoken) void voice.speak(words);
    };
    let draftNow: LogDraft | undefined;
    if (logging.current !== undefined) {
      const held = logging.current;
      if (/^(cancel|never mind|nevermind|forget it|stop|no)\b/iu.test(text)) {
        logging.current = undefined;
        say('Okay, I left it out.');
        return;
      }
      const read = readInto(held, text, allPins);
      const changed =
        read.activity !== held.activity ||
        JSON.stringify(read.where) !== JSON.stringify(held.where) ||
        read.minutes !== held.minutes ||
        read.date !== held.date ||
        read.start !== held.start;
      if (changed) draftNow = read;
      else if (text.trim().endsWith('?')) logging.current = undefined;
      else draftNow = held;
    } else if (isOutdoorStatement(text)) {
      draftNow = startDraft(text, people, allPins);
    }
    if (draftNow !== undefined) {
      const step = nextStep(draftNow, people, allPins, clock);
      if (step.kind === 'ask') {
        logging.current = step.draft;
        say(step.text, { chips: step.chips });
      } else if (step.kind === 'save') {
        logging.current = undefined;
        const mine = loadOutings(window.localStorage, step.person.id);
        saveOutings(
          window.localStorage,
          step.person.id,
          addOuting(mine, newOuting(step.outing, mine)),
        );
        say(addedText(step.person, step.outing), {
          basis: 'Added to Exposure',
          link: {
            to: `/exposure?person=${encodeURIComponent(step.person.id)}&hour=${String(Math.floor((step.outing.start + step.outing.minutes - 1) / 60))}`,
            label: 'See it in Exposure',
          },
        });
      } else {
        logging.current = undefined;
        say(step.text);
      }
      return;
    }
    // A question about a place that has not been set is answered by asking for it first.
    const asked = text.toLowerCase();
    const wanted: Role | undefined = /\b(school|college)\b/u.test(asked)
      ? 'school'
      : /\b(work|office)\b/u.test(asked) && !/\b(workout|works)\b/u.test(asked)
        ? 'work'
        : undefined;
    if (wanted !== undefined && pinForRole(wanted, allPins) === undefined) {
      const words =
        wanted === 'school'
          ? 'Add a school on My Air first, so I can tell you about the air there. Use the Work or school field, and choose School.'
          : 'Add a work place on My Air first, so I can tell you about the air there. Use the Work or school field, and choose Work.';
      say(words, { basis: 'No place set' });
      return;
    }
    const roleContext =
      wanted === 'school' ? schoolContext : wanted === 'work' ? workContext : undefined;
    if (context === undefined) {
      const stuck = first === undefined || state?.status === 'error';
      if (!stuck) {
        // The air for the place is still on its way: say so, and answer the moment it arrives.
        waitingFor.current = text;
        setBusy(true);
        return;
      }
      const words =
        first === undefined
          ? 'Add a place on My Air first, so there is some air to talk about.'
          : 'We could not get the air just now, so I have nothing to go on. Please try again in a moment.';
      setMessages((m) => [
        ...m,
        { id: next.current++, from: 'vayu', text: words, basis: 'No reading yet' },
      ]);
      if (spoken) void voice.speak(words);
      return;
    }
    respond(text, roleContext ?? context);
  };

  /** Asks the source and shows its answer, which is also spoken unless it is muted. */
  const respond = (text: string, ctx: AssistantContext): void => {
    setBusy(true);
    source.ask(text, ctx).then(
      (answer) => {
        setMessages((m) => [
          ...m,
          {
            id: next.current++,
            from: 'vayu',
            text: answer.text,
            basis: answer.basis,
          },
        ]);
        setBusy(false);
        if (spoken) void voice.speak(answer.text);
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

  // A question asked while the air was still loading is answered as soon as it has loaded.
  useEffect(() => {
    const waiting = waitingFor.current;
    if (waiting === undefined) return;
    if (context === undefined) {
      // The air could not be had: say so, rather than leave the question hanging.
      if (state?.status === 'error') {
        waitingFor.current = undefined;
        setBusy(false);
        const words =
          'We could not get the air just now, so I have nothing to go on. Please try again in a moment.';
        setMessages((m) => [
          ...m,
          { id: next.current++, from: 'vayu', text: words, basis: 'No reading yet' },
        ]);
      }
      return;
    }
    waitingFor.current = undefined;
    respond(waiting, context);
    // Only when the air arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, state?.status]);

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

  // Listening shows the words as they are understood, and stops by itself after a few quiet seconds.
  const byVoice = (): void => {
    if (hearing.current !== undefined) {
      hearing.current.stop();
      return;
    }
    voice.stop();
    voice.unlock?.();
    setTranscript('');
    setListening(true);
    hearing.current = listenLive({
      onTranscript: setTranscript,
      onEnd: (heard) => {
        hearing.current = undefined;
        setListening(false);
        setTranscript('');
        if (heard !== undefined) ask(heard);
      },
    });
    if (hearing.current === undefined) setListening(false);
  };
  const setVoiceOn = (on: boolean): void => {
    setSpoken(on);
    if (!on) voice.stop();
    try {
      window.localStorage.setItem(VOICE_KEY, on ? 'on' : 'off');
    } catch {
      // Best effort: it still holds for this visit.
    }
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
        <span className="fab-label">Assistant</span>
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
                  {airStore().kind === 'sample' ? (
                    <>
                      <Pill>Sample data</Pill> Answers use made-up air, from fixed rules.
                    </>
                  ) : (
                    <>
                      <Pill>Live</Pill> Answers come from fixed rules over the real readings. AI
                      only words them, and its words are checked.
                    </>
                  )}
                </p>
              </div>
              <div className="sheet-head-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Read answers aloud"
                  aria-pressed={spoken}
                  title={
                    spoken
                      ? 'Answers are read aloud. Tap to mute.'
                      : 'Muted. Tap to read answers aloud.'
                  }
                  onClick={() => {
                    setVoiceOn(!spoken);
                  }}
                >
                  {spoken ? (
                    <Volume2 size={20} aria-hidden="true" />
                  ) : (
                    <VolumeX size={20} aria-hidden="true" />
                  )}
                </button>
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
                          <button
                            type="button"
                            className="link-button"
                            aria-label="Listen to this answer"
                            onClick={() => {
                              voice.unlock?.();
                              void voice.speak(m.text);
                            }}
                          >
                            <Volume2 size={14} aria-hidden="true" /> Listen
                          </button>
                        </p>
                      )}
                      {m.chips !== undefined && m.chips.length > 0 && (
                        <div className="chips bubble-chips" role="group" aria-label="Quick answers">
                          {m.chips.map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              className="choice"
                              disabled={busy}
                              onClick={() => {
                                ask(chip);
                              }}
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      )}
                      {m.link !== undefined && (
                        <Link
                          to={m.link.to}
                          className="bubble-link"
                          onClick={() => {
                            setOpen(false);
                          }}
                        >
                          {m.link.label}
                        </Link>
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
                {listening && (
                  <div className="listening" role="status" aria-live="polite">
                    <span className="listen-bars" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="listen-words">
                      <strong>{transcript === '' ? 'Listening…' : 'Transcribing…'}</strong>
                      <span className={`listen-text${transcript === '' ? ' muted' : ''}`}>
                        {transcript === ''
                          ? 'Say it now. It stops by itself after a few quiet seconds.'
                          : transcript}
                        {transcript !== '' && <i className="caret" aria-hidden="true" />}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="listen-cancel"
                      onClick={() => {
                        hearing.current?.cancel();
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
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
                      className={`icon-button mic${listening ? ' live' : ''}`}
                      aria-label={listening ? 'Stop listening' : 'Speak to the assistant'}
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
