import { Languages, Mic, SendHorizontal, Sparkles, Store, Volume2, VolumeX, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { alertsFor } from '../alerts/model';
import { useFires } from '../alerts/useFires';
import { useHousehold } from '../exposure/useExposure';
import { readDemo } from '../demo/state';
import { airStore, useToday } from '../air/store';
import { API_URL } from '../config';
import { writeUrl } from './writeUrl';
import { weekActive } from '../week/active';
import { useLivePin } from '../places/liveLocation';
import { usePins } from '../places/usePins';
import { Pill } from '../today/ui/Chip';
import { apiAssistant } from './api';
import { basisHindi, loadLang, saveLang, type Lang } from './lang';
import { WORDS } from './strings';
import { buildContext } from './context';
import { localAssistant } from './local';
import { RequestForm } from './RequestForm';
import { addedText } from './outingParse';
import { isOutdoorStatement, nextStep, readInto, startDraft, type LogDraft } from './logging';
import { isFireReport, isSendIt, placeFromText, type FireDraft } from './fireReporting';
import { sentWords, submitFireReport } from '../map/fireReport';
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
  // The language answers are given in and listened for: chosen here, and kept on this device.
  const [lang, setLangState] = useState<Lang>(loadLang);
  const t = WORDS[lang];
  // Said under the chat when an answer could not be read aloud, so a silence is never a mystery.
  const [voiceNote, setVoiceNote] = useState(false);
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
      alertsFor(reading, fires, { school: pinForRole('school', pins) !== undefined }),
      fires,
      household.people,
    );
  }, [first, reading, fires, household.people, pins]);

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
            alertsFor(workReading, fires, { school: false }),
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
  const fire = useRef<FireDraft | undefined>(undefined);

  /** Reads words aloud, and notes it if nothing could be heard. */
  const speakNow = (words: string): void => {
    void voice.speak(words, lang).then(
      (heard) => {
        setVoiceNote(heard === false);
      },
      () => {
        setVoiceNote(true);
      },
    );
  };

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
        { id: next.current++, from: 'vayu', text: words, basis: t.outdoorBasis, ...extra },
      ]);
      if (spoken) speakNow(words);
    };
    // A question in the middle of finding the fire's place is a new question, not an answer to it.
    if (
      fire.current !== undefined &&
      fire.current.where === undefined &&
      /\?\s*$/u.test(text) &&
      !isFireReport(text)
    )
      fire.current = undefined;
    // Someone telling us about a fire is helped to report it: where, then anything to add, then it is sent.
    if (fire.current !== undefined || (logging.current === undefined && isFireReport(text))) {
      const held: FireDraft = fire.current ?? {};
      const basis = t.fireBasis;
      if (
        /^(cancel|never mind|nevermind|forget it|stop)\b/iu.test(text) ||
        /^(रद्द|छोड़ो|छोड़ दो|रहने दो|नहीं भेजना|रुको|कैंसिल)/u.test(text)
      ) {
        fire.current = undefined;
        say(t.notSent, { basis });
        return;
      }
      const askNote = (where: NonNullable<FireDraft['where']>): void => {
        fire.current = { where, asked: 'note' };
        say(t.fireNote(where.label), { basis, chips: [t.sendIt] });
      };
      const send = (where: NonNullable<FireDraft['where']>, note: string | undefined): void => {
        fire.current = undefined;
        void submitFireReport(
          { lat: where.lat, lng: where.lng, ...(note === undefined ? {} : { note }) },
          { baseUrl: writeUrl(airStore().kind === 'live', weekActive(), API_URL) },
        ).then(
          (how) => {
            say(sentWords(how, lang), {
              basis,
              link: {
                to: `/map?lat=${String(where.lat)}&lng=${String(where.lng)}&z=10`,
                label: t.seeOnMap,
              },
            });
          },
          (error: unknown) => {
            say(error instanceof Error ? error.message : t.didNotGoThrough, { basis });
          },
        );
      };
      if (held.where !== undefined && held.asked === 'note') {
        send(held.where, isSendIt(text) ? undefined : text.trim().slice(0, 200));
        return;
      }
      const found = placeFromText(text, allPins);
      if (found === undefined) {
        fire.current = {};
        say(t.whereIsFire, {
          basis,
          chips: [t.nearMe, ...allPins.map((p) => p.name).slice(0, 4)],
        });
        return;
      }
      if (found === 'here') {
        if (!('geolocation' in navigator)) {
          fire.current = {};
          say(t.cannotLocate, { basis });
          return;
        }
        fire.current = {};
        say(t.findingYou, { basis });
        navigator.geolocation.getCurrentPosition(
          (position) => {
            askNote({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              label: 'where you are',
            });
          },
          () => {
            say(t.couldNotLocate, { basis });
          },
          { timeout: 10_000 },
        );
        return;
      }
      askNote(found);
      return;
    }
    let draftNow: LogDraft | undefined;
    if (logging.current !== undefined) {
      const held = logging.current;
      if (
        /^(cancel|never mind|nevermind|forget it|stop|no)\b/iu.test(text) ||
        /^(रद्द|छोड़ो|छोड़ दो|रहने दो|रुको|नहीं|कैंसिल)/u.test(text)
      ) {
        logging.current = undefined;
        say(t.leftOut);
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
      const step = nextStep(draftNow, people, allPins, clock, lang);
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
        say(addedText(step.person, step.outing, lang), {
          basis: t.addedBasis,
          link: {
            to: `/exposure?person=${encodeURIComponent(step.person.id)}&hour=${String(Math.floor((step.outing.start + step.outing.minutes - 1) / 60))}`,
            label: t.seeInExposure,
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
    const wanted: Role | undefined = /\b(school|college)\b|स्कूल|विद्यालय|कॉलेज/u.test(asked)
      ? 'school'
      : /\b(work|office)\b|दफ़्तर|दफ्तर|ऑफिस|ऑफ़िस/u.test(asked) &&
          !/\b(workout|works)\b/u.test(asked)
        ? 'work'
        : undefined;
    if (wanted !== undefined && pinForRole(wanted, allPins) === undefined) {
      say(wanted === 'school' ? t.noSchool : t.noWork, { basis: t.noPlaceBasis });
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
      const words = first === undefined ? t.addPlaceFirst : t.noAirNow;
      setMessages((m) => [
        ...m,
        { id: next.current++, from: 'vayu', text: words, basis: t.noReadingBasis },
      ]);
      if (spoken) speakNow(words);
      return;
    }
    respond(text, roleContext ?? context);
  };

  /** Asks the source and shows its answer, which is also spoken unless it is muted. */
  const respond = (text: string, ctx: AssistantContext): void => {
    setBusy(true);
    source.ask(text, ctx, lang).then(
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
        if (spoken) speakNow(answer.text);
      },
      () => {
        setMessages((m) => [
          ...m,
          {
            id: next.current++,
            from: 'vayu',
            text: t.noAnswer,
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
        const words = t.noAirNow;
        setMessages((m) => [
          ...m,
          { id: next.current++, from: 'vayu', text: words, basis: t.noReadingBasis },
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
      lang,
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
  const chooseLang = (next: Lang): void => {
    if (next === lang) return;
    voice.stop();
    hearing.current?.cancel();
    setLangState(next);
    saveLang(next);
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
        aria-label={t.title}
        aria-haspopup="dialog"
        onClick={() => {
          setView('chat');
          setOpen(true);
        }}
      >
        <Sparkles size={22} strokeWidth={1.75} aria-hidden="true" />
        <span className="fab-label">{lang === 'hi' ? 'सहायक' : 'Assistant'}</span>
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
                <h2 id="assistant-title">{t.title}</h2>
                <p className="muted small">
                  {airStore().kind === 'sample' ? (
                    <>
                      <Pill>{lang === 'hi' ? 'नमूना डेटा' : 'Sample data'}</Pill> {t.sampleNote}
                    </>
                  ) : (
                    <>
                      <Pill>
                        {weekActive()
                          ? lang === 'hi'
                            ? 'रिकॉर्ड किया हुआ'
                            : 'Recorded'
                          : lang === 'hi'
                            ? 'लाइव'
                            : 'Live'}
                      </Pill>{' '}
                      {t.liveNote}
                    </>
                  )}
                </p>
                <div className="lang-row">
                  <div className="lang-switch" role="group" aria-label={t.languageLabel}>
                    <Languages size={16} aria-hidden="true" />
                    {(['en', 'hi'] as const).map((code) => (
                      <button
                        key={code}
                        type="button"
                        aria-pressed={lang === code}
                        lang={code}
                        onClick={() => {
                          chooseLang(code);
                        }}
                      >
                        {code === 'en' ? t.languageEnglish : t.languageHindi}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="sheet-head-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t.readAloud}
                  aria-pressed={spoken}
                  title={spoken ? t.readAloudOn : t.readAloudOff}
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
                  aria-label={t.close}
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
                  <p className="bubble vayu">{t.greeting}</p>
                  {messages.map((m) => (
                    <div key={m.id} className={`bubble ${m.from}`}>
                      <p>{m.text}</p>
                      {m.from === 'vayu' && m.basis !== undefined && (
                        <p className="small muted bubble-foot">
                          {lang === 'hi' ? basisHindi(m.basis) : m.basis}
                          <button
                            type="button"
                            className="link-button"
                            aria-label={
                              lang === 'hi' ? 'इस जवाब को सुनें' : 'Listen to this answer'
                            }
                            onClick={() => {
                              voice.unlock?.();
                              speakNow(m.text);
                            }}
                          >
                            <Volume2 size={14} aria-hidden="true" /> {t.listen}
                          </button>
                        </p>
                      )}
                      {m.chips !== undefined && m.chips.length > 0 && (
                        <div
                          className="chips bubble-chips"
                          role="group"
                          aria-label={t.quickAnswers}
                        >
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
                  {busy && <p className="bubble vayu muted">{t.checking}</p>}
                  {voiceNote && (
                    <p className="small muted voice-note" role="status">
                      {t.voiceOff}
                    </p>
                  )}
                  <div ref={end} />
                </div>
                <section
                  className="ask-cta"
                  aria-label={lang === 'hi' ? 'अपनी जगह पर वायु पाएँ' : 'Get Vayu at your place'}
                >
                  <Store size={22} strokeWidth={1.75} aria-hidden="true" />
                  <span>
                    <strong>{t.ctaTitle}</strong>
                    <span className="muted small">{t.ctaNote}</span>
                  </span>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      setView('request');
                    }}
                  >
                    {t.request}
                  </button>
                </section>
                <div className="chips" role="group" aria-label={t.suggested}>
                  {[
                    ...t.suggestions,
                    ...loadHousehold(window.localStorage)
                      .people.filter((p) => p.id !== 'me')
                      .slice(0, 1)
                      .map((p) => t.walkedIn(p.name)),
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
                      <strong>{transcript === '' ? t.listening : t.transcribing}</strong>
                      <span className={`listen-text${transcript === '' ? ' muted' : ''}`}>
                        {transcript === '' ? t.sayItNow : transcript}
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
                      {t.cancel}
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
                    {t.yourMessage}
                  </label>
                  <input
                    id="ask-input"
                    ref={input}
                    value={draft}
                    placeholder={t.placeholder}
                    autoComplete="off"
                    onChange={(event) => {
                      setDraft(event.target.value);
                    }}
                  />
                  {canListen() && (
                    <button
                      type="button"
                      className={`icon-button mic${listening ? ' live' : ''}`}
                      aria-label={listening ? t.stopListening : t.speak}
                      aria-pressed={listening}
                      onClick={byVoice}
                    >
                      <Mic size={20} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="submit"
                    className="primary send"
                    aria-label={t.send}
                    disabled={busy}
                  >
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
