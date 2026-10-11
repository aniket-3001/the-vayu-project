import type { Pin } from '../data/pins';
import {
  ACTIVITY_LABELS,
  problemWithOuting,
  type Activity,
  type Outing,
} from '../exposure/outings';
import { today, yesterday, type DateKey } from '../exposure/model';
import type { Person } from '../exposure/people';
import { pinForRole, roleOfLabel, ROLE_WORDS, type Role } from '../places/roles';
import { asciiDigits, minutesInHindi, type Lang } from './lang';
import { minutesIn } from './outingParse';

/**
 * What the assistant is putting together when someone says what they did outdoors: who, what they did, where (one
 * of their set places) and for how long. Anything missing is asked for, one thing at a time.
 */
export interface LogDraft {
  readonly personId: string;
  readonly activity?: Activity;
  /** A set place, by its role (home, school, work, park) or by its name. */
  readonly where?: { readonly role: Role } | { readonly name: string };
  readonly minutes?: number;
  readonly date: DateKey;
  readonly start?: number;
  /** What was last asked, so a bare answer such as “30” or “home” is read for it. */
  readonly asked?: 'activity' | 'where' | 'minutes';
}

export type LogStep =
  /** Ask for the next missing thing. */
  | {
      readonly kind: 'ask';
      readonly draft: LogDraft;
      readonly text: string;
      readonly chips: readonly string[];
    }
  /** The place they named has not been set. */
  | { readonly kind: 'needs-place'; readonly text: string }
  /** Everything is there and it can be saved. */
  | { readonly kind: 'save'; readonly person: Person; readonly outing: Omit<Outing, 'id'> }
  /** Something about it cannot be saved as said. */
  | { readonly kind: 'problem'; readonly text: string };

const QUESTION =
  /^(can|could|should|is|are|will|would|when|what|where|how|do|does|did|which|why)\b/u;
const PAST =
  /\b(took|take|walked|went|played|ran|jogged|cycled|biked|was|were|had|spent|did|been|go|going|am|i'm)\b/u;
const OUTSIDE =
  /\b(walk|walked|walking|stroll|strolled|jog|jogged|jogging|ran|run|running|play|played|playing|cycle|cycled|cycling|bike|biked|biking|outside|outdoors?|park|playground|garden)\b/u;

/** The same in Hindi (Devanagari), which has no word boundaries to match on: the stems are matched anywhere. */
const QUESTION_HI =
  /^(क्या|कब|कहाँ|कहां|कैसे|क्यों|कौन|कितना|कितनी|कितने|कौन सा|कौन सी)|क्या\s*[^.]*\?/u;
const PAST_HI =
  /(गया|गयी|गई|गए|गये|खेला|खेली|खेले|टहला|टहली|टहले|दौड़ा|दौड़ी|दौड़े|चला|चली|चले|किया|की\b|थे\b|था\b|थी\b|लगाई|लगाया|बिताया|बिताए)/u;
const OUTSIDE_HI = /(टहल|सैर|दौड़|खेल|साइकिल|बाहर|पार्क|मैदान|बगीचा|गार्डन)/u;
const LOGGING_HI = /(जोड़|दर्ज|लिख|नोट|रिकॉर्ड|सेव)/u;

const ACTIVITY_WORDS: readonly (readonly [Activity, RegExp])[] = [
  [
    'walk',
    /\b(walk|walked|walking|stroll|strolled|jog|jogged|jogging|ran|run|running)\b|टहल|सैर|दौड़|जॉग/u,
  ],
  ['play', /\b(play|played|playing)\b|खेल/u],
  ['cycle', /\b(cycle|cycled|cycling|bike|biked|biking)\b|साइकिल|सायकल/u],
];

const WHERE_WORDS: readonly (readonly [Role, RegExp])[] = [
  ['school', /\b(school|college|campus|class)\b|स्कूल|कॉलेज|विद्यालय/u],
  ['work', /\b(work|office)\b|दफ़्तर|दफ्तर|ऑफिस|ऑफ़िस|काम की जगह/u],
  ['outdoor', /\b(park|playground|garden|ground)\b|पार्क|मैदान|बगीचा|गार्डन/u],
  ['home', /\b(home|house|flat|apartment)\b|घर|मकान|फ्लैट/u],
];

/** "from 4:30 to 5" or "4 to 4:30 pm": a start and a length, when both ends are said. */
function rangeIn(text: string): { readonly start: number; readonly minutes: number } | undefined {
  const m =
    /\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|till|until|-|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/u.exec(
      text,
    );
  if (m === null) return undefined;
  const to = (hour: string, minute: string | undefined, mer: string | undefined): number => {
    let h = Number(hour);
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    return h * 60 + Number(minute ?? 0);
  };
  const end = to(m[4] ?? '0', m[5], m[6]);
  let start = to(m[1] ?? '0', m[2], m[3] ?? m[6]);
  // "4 to 4:30 pm": the start has the same half of the day as the end, unless that puts it after the end.
  if (start >= end && start >= 12 * 60 && m[3] === undefined) start -= 12 * 60;
  const minutes = end - start;
  if (start < 0 || minutes < 5 || minutes > 6 * 60 || end > 24 * 60) return undefined;
  return { start, minutes };
}

function startIn(text: string): number | undefined {
  const at = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/u.exec(text);
  if (at !== null) {
    let hour = Number(at[1]);
    const minute = Number(at[2] ?? 0);
    if (at[3] === 'pm' && hour < 12) hour += 12;
    if (at[3] === 'am' && hour === 12) hour = 0;
    if (hour <= 23 && minute <= 59) return hour * 60 + minute;
  }
  const baje = /(सुबह|दोपहर|शाम|रात)?\s*(\d{1,2})\s*बजे/u.exec(text);
  if (baje !== null) {
    let hour = Number(baje[2]);
    if ((baje[1] === 'शाम' || baje[1] === 'दोपहर' || baje[1] === 'रात') && hour < 12) hour += 12;
    if (hour <= 23) return hour * 60;
  }
  if (/\bmorning\b|सुबह/u.test(text)) return 7 * 60;
  if (/\bafternoon\b|दोपहर/u.test(text)) return 15 * 60;
  if (/\bevening\b|शाम/u.test(text)) return 17 * 60;
  return undefined;
}

/** Asking for it to be written down: "log a 30 minute walk", "add my walk", "I want to record a run". */
const LOGGING = /\b(log|logs|logged|add|record|note|enter|track|save|count|put)\b/u;
/** An activity with a length of time beside it, with no verb: "30 minute walk", "walk 30 min". */
const TIMED =
  /\b\d+(?:\.\d+)?\s*(?:min|mins|minutes?|hours?|hrs?)\s+(?:walk|run|jog|stroll|cycle|ride|play)\b|\b(?:walk|walked|run|ran|jog|jogged|stroll|cycle|cycled|play|played)\b[^.?]*\b\d+(?:\.\d+)?\s*(?:min|mins|minutes?|hours?|hrs?)\b/u;

/**
 * Whether a sentence is someone saying, or asking to be written down, what they did outdoors, and not asking
 * something about the air.
 */
export function isOutdoorStatement(text: string): boolean {
  const t = asciiDigits(text.toLowerCase().trim());
  const outside = OUTSIDE.test(t) || OUTSIDE_HI.test(t);
  const asking =
    /^(how|what|where|why|when)\b/u.test(t) || /^(कैसे|क्या|कहाँ|कहां|क्यों|कब)/u.test(t);
  // A request to log, even politely or as a question: "can you log my walk?". Not "how do I log a walk?".
  if ((LOGGING.test(t) || LOGGING_HI.test(t)) && outside && !asking) return true;
  if (t.endsWith('?') || t.endsWith('？') || QUESTION.test(t) || QUESTION_HI.test(t)) return false;
  if ((PAST.test(t) || PAST_HI.test(t)) && outside) return true;
  // An activity with a length of time beside it, with no verb: "30 मिनट टहलना".
  return TIMED.test(t) || (OUTSIDE_HI.test(t) && minutesInHindi(t) !== undefined);
}

const escape = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** Whose day it is: a named person on the list, otherwise the person holding the phone. */
export function whoIs(text: string, people: readonly Person[]): Person | undefined {
  const t = text.toLowerCase();
  const named = [...people]
    .filter((p) => p.id !== 'me')
    .sort((a, b) => b.name.length - a.name.length)
    .find((p) =>
      // A name in Devanagari has no word boundary to match on, so it is looked for anywhere.
      /[\u0900-\u097F]/u.test(p.name)
        ? t.includes(p.name.toLowerCase())
        : new RegExp(`\\b${escape(p.name.toLowerCase())}\\b`, 'u').test(t),
    );
  return named ?? people.find((p) => p.id === 'me');
}

/** Reads what a message adds to a draft: an activity, a place, a length of time, a day and a time of day. */
export function readInto(draft: LogDraft, text: string, pins: readonly Pin[]): LogDraft {
  const t = asciiDigits(text.toLowerCase().trim());
  let next: LogDraft = { ...draft };
  if (next.activity === undefined) {
    const found = ACTIVITY_WORDS.find(([, pattern]) => pattern.test(t));
    if (found !== undefined) next = { ...next, activity: found[0] };
    // “Something else” is an answer to “what did you do”.
    else if (draft.asked === 'activity' && /\b(else|other|different)\b|कुछ और|दूसरा|अलग/u.test(t))
      next = { ...next, activity: 'other' };
  }
  if (next.where === undefined) {
    // A place named by its own name wins over a general word such as “home”.
    const named = [...pins]
      .filter((pin) => roleOfLabel(pin.name) === undefined)
      .sort((a, b) => b.name.length - a.name.length)
      .find((pin) => new RegExp(`\\b${escape(pin.name.toLowerCase())}\\b`, 'u').test(t));
    if (named !== undefined) next = { ...next, where: { name: named.name } };
    else {
      const found = WHERE_WORDS.find(([, pattern]) => pattern.test(t));
      if (found !== undefined) next = { ...next, where: { role: found[0] } };
    }
  }
  const range = rangeIn(t);
  if (range !== undefined) {
    if (next.minutes === undefined) next = { ...next, minutes: range.minutes };
    if (next.start === undefined) next = { ...next, start: range.start };
  }
  if (next.minutes === undefined) {
    const said =
      minutesIn(t) ??
      minutesInHindi(t) ??
      // A bare number is a length of time only when that is what was just asked.
      (draft.asked === 'minutes' && /^\d{1,3}$/u.test(t) ? Number(t) : undefined);
    if (said !== undefined && said > 0) next = { ...next, minutes: said };
  }
  if (/\byesterday\b/u.test(t) || (/(बीते कल|कल)/u.test(t) && PAST_HI.test(t)))
    next = { ...next, date: yesterday() };
  const start = startIn(t);
  if (start !== undefined && next.start === undefined) next = { ...next, start };
  return next;
}

/** A fresh draft from a sentence, for whoever it is about. */
export function startDraft(
  text: string,
  people: readonly Person[],
  pins: readonly Pin[],
): LogDraft | undefined {
  const person = whoIs(text, people);
  if (person === undefined) return undefined;
  return readInto({ personId: person.id, date: today() }, text, pins);
}

const WHERE_CHIPS = (pins: readonly Pin[]): readonly string[] => {
  const names = pins.map((pin) => pin.name);
  return names.length > 0 ? names.slice(0, 5) : [];
};

const whereWords = (where: NonNullable<LogDraft['where']>): string =>
  'role' in where ? ROLE_WORDS[where.role] : where.name;

/**
 * The next thing to do with a draft: ask for what is missing (what they did, then where, then for how long), say
 * that a place has to be added first, or save it. A person’s name and the day are never asked for.
 */
export function nextStep(
  draft: LogDraft,
  people: readonly Person[],
  pins: readonly Pin[],
  now: { readonly date: DateKey; readonly minutes: number },
  lang: Lang = 'en',
): LogStep {
  const hi = lang === 'hi';
  const person = people.find((p) => p.id === draft.personId);
  const whose = person === undefined || person.id === 'me' ? 'you' : person.name;
  if (draft.activity === undefined)
    return {
      kind: 'ask',
      draft: { ...draft, asked: 'activity' },
      text: hi
        ? `${whose === 'you' ? 'आपने' : `${whose} ने`} बाहर क्या किया: टहलना, खेल, साइकिल या कुछ और?`
        : `What did ${whose} do outside: a walk, play, a cycle, or something else?`,
      chips: hi
        ? ['टहलना', 'खेल', 'साइकिल', 'कुछ और']
        : ['A walk', 'Play', 'A cycle', 'Something else'],
    };
  if (draft.where === undefined) {
    if (pins.length === 0)
      return {
        kind: 'needs-place',
        text: hi
          ? 'पहले मेरी हवा (My Air) पर अपनी जगहें जोड़ें (घर, काम या स्कूल, पार्क), फिर बताएँ कि यह कहाँ हुआ।'
          : 'Add your places on My Air first (home, work or school, a park), then tell me where it was.',
      };
    return {
      kind: 'ask',
      draft: { ...draft, asked: 'where' },
      text: hi
        ? 'यह कहाँ हुआ? अपनी सेट की हुई किसी जगह का नाम बताएँ।'
        : 'Where was it? Say a place you have set.',
      chips: WHERE_CHIPS(pins),
    };
  }
  const pin =
    'role' in draft.where
      ? pinForRole(draft.where.role, pins)
      : pins.find((p) => p.name === (draft.where as { name: string }).name);
  if (pin === undefined)
    return {
      kind: 'needs-place',
      text: hi
        ? `अभी ${WORD_HINDI['role' in draft.where ? draft.where.role : 'outdoor']} वाली जगह सेट नहीं है। पहले मेरी हवा पर जोड़ें, फिर दोबारा बताएँ।`
        : `There is no ${whereWords(draft.where)} place set yet. Add it on My Air first, then tell me again.`,
    };
  if (draft.minutes === undefined)
    return {
      kind: 'ask',
      draft: { ...draft, asked: 'minutes' },
      text: hi ? `${pin.name} में कितनी देर?` : `For how long, at ${pin.name}?`,
      chips: hi ? ['15 मिनट', '30 मिनट', '1 घंटा'] : ['15 minutes', '30 minutes', '1 hour'],
    };
  if (person === undefined)
    return {
      kind: 'problem',
      text: hi ? 'मैं समझ नहीं पाया कि यह किसका दिन है।' : 'I could not tell whose day this is.',
    };
  const minutes = draft.minutes;
  let start =
    draft.start ?? (draft.date === now.date ? Math.max(0, now.minutes - minutes) : 17 * 60);
  if (start + minutes > 24 * 60) start = 24 * 60 - minutes;
  const problem = problemWithOuting({ start, minutes }, draft.date, today(), now.minutes);
  if (problem !== undefined)
    return {
      kind: 'problem',
      text: hi
        ? 'यह इस तरह दर्ज नहीं हो सकता। कृपया दोबारा बताएँ कि यह कब हुआ था।'
        : `${problem} Tell me again when it was.`,
    };
  return {
    kind: 'save',
    person,
    outing: {
      date: draft.date,
      start,
      minutes,
      activity: draft.activity,
      pin,
      trees:
        /park|garden|tree|green/iu.test(pin.name) ||
        ('role' in draft.where && draft.where.role === 'outdoor'),
    },
  };
}

const WORD_HINDI: Readonly<Record<Role, string>> = {
  home: 'घर',
  work: 'काम',
  school: 'स्कूल',
  outdoor: 'पार्क',
};

/** The words for an activity, for a chip or a sentence. */
export const activityName = (activity: Activity): string => ACTIVITY_LABELS[activity].toLowerCase();
