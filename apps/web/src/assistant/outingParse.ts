import type { Pin } from '../data/pins';
import { yesterday, today, ambientByHour, formatDate, type DateKey } from '../exposure/model';
import {
  ACTIVITY_LABELS,
  clockOf,
  problemWithOuting,
  type Activity,
  type Outing,
} from '../exposure/outings';
import type { Person } from '../exposure/people';
import { usAqi } from '@vayu/core';
import { minutesInHindi, type Lang } from './lang';

export type OutingIntent =
  /** Something a person did outdoors, ready to save. */
  | { readonly kind: 'add'; readonly person: Person; readonly outing: Omit<Outing, 'id'> }
  /** Someone's outdoor time, but it cannot be saved as it stands. */
  | { readonly kind: 'problem'; readonly person: Person; readonly text: string };

const QUESTION =
  /^(can|could|should|is|are|will|would|when|what|where|how|do|does|did|which|why)\b/u;
const PAST =
  /\b(took|take|walked|went|played|ran|jogged|cycled|biked|was|were|had|spent|did|been)\b/u;
const OUTSIDE =
  /\b(walk|walked|walking|stroll|strolled|jog|jogged|jogging|ran|run|running|play|played|playing|cycle|cycled|cycling|bike|biked|biking|outside|outdoors?|park|playground|garden)\b/u;

/** How long, in minutes, from words such as "40 minutes", "an hour", "1 hour 20 minutes" or "half an hour". */
export function minutesIn(text: string): number | undefined {
  const t = text.toLowerCase();
  let total = 0;
  let found = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/gu)) {
    total += Number(m[1]) * 60;
    found = true;
  }
  for (const m of t.matchAll(/(\d+)\s*(minutes?|mins?|m)\b/gu)) {
    total += Number(m[1]);
    found = true;
  }
  if (found) return Math.round(total);
  if (/\bhalf an hour\b|\bhalf hour\b/u.test(t)) return 30;
  if (/\bquarter of an hour\b/u.test(t)) return 15;
  if (/\ba couple of hours\b/u.test(t)) return 120;
  if (/\b(an|one|1) hour\b/u.test(t)) return 60;
  return minutesInHindi(t);
}

/** The time of day named, in minutes after midnight, if any. */
function startIn(text: string): number | undefined {
  const at = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/u.exec(text);
  if (at !== null) {
    let hour = Number(at[1]);
    const minute = Number(at[2] ?? 0);
    if (at[3] === 'pm' && hour < 12) hour += 12;
    if (at[3] === 'am' && hour === 12) hour = 0;
    if (hour <= 23 && minute <= 59) return hour * 60 + minute;
  }
  if (/\bmorning\b/u.test(text)) return 7 * 60;
  if (/\bafternoon\b/u.test(text)) return 15 * 60;
  if (/\bevening\b/u.test(text)) return 17 * 60;
  return undefined;
}

const activityOf = (text: string): Activity =>
  /\b(walk|walked|walking|stroll|strolled|jog|jogged|jogging|ran|run|running)\b/u.test(text)
    ? 'walk'
    : /\b(play|played|playing)\b/u.test(text)
      ? 'play'
      : /\b(cycle|cycled|cycling|bike|biked|biking)\b/u.test(text)
        ? 'cycle'
        : 'other';

function placeIn(text: string, pins: readonly Pin[]): Pin | undefined {
  const named = [...pins]
    .sort((a, b) => b.name.length - a.name.length)
    .find((pin) => text.includes(pin.name.toLowerCase()));
  if (named !== undefined) return named;
  const park = pins.find((p) => /park/iu.test(p.name));
  return park ?? pins[0];
}

/**
 * Reads a sentence such as "Asha took a walk in the park for 40 minutes" or "Dev played outside yesterday
 * evening for an hour" and says what to add. Questions are left to the rest of the assistant. This is plain
 * pattern matching, so when it cannot tell, it asks; Amazon Bedrock will read freer sentences once it is
 * plugged in.
 */
export function parseOuting(
  text: string,
  people: readonly Person[],
  pins: readonly Pin[],
  now: { readonly date: DateKey; readonly minutes: number },
): OutingIntent | undefined {
  const t = text.toLowerCase().trim();
  if (t.endsWith('?') || QUESTION.test(t) || !PAST.test(t) || !OUTSIDE.test(t)) return undefined;
  const named = [...people]
    .filter((p) => p.id !== 'me')
    .sort((a, b) => b.name.length - a.name.length)
    .find((p) =>
      new RegExp(`\\b${p.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`, 'u').test(
        t,
      ),
    );
  // "I walked…" is the person holding the phone.
  const person =
    named ?? (/\b(i|my|me)\b/u.test(t) ? people.find((p) => p.id === 'me') : undefined);
  if (person === undefined) return undefined;

  const minutes = minutesIn(t);
  if (minutes === undefined)
    return {
      kind: 'problem',
      person,
      text: `For how long was ${person.name} outside? Say it like “${person.name} walked in the park for 40 minutes”.`,
    };
  const pin = placeIn(t, pins);
  if (pin === undefined)
    return {
      kind: 'problem',
      person,
      text: 'Pin a place on My Air first, so there is somewhere to put it.',
    };

  const date = /\byesterday\b/u.test(t) ? yesterday() : now.date;
  const said = startIn(t);
  let start = said ?? (date === now.date ? Math.max(0, now.minutes - minutes) : 17 * 60);
  if (start + minutes > 24 * 60) start = 24 * 60 - minutes;
  const problem = problemWithOuting({ start, minutes }, date, today(), now.minutes);
  if (problem !== undefined)
    return { kind: 'problem', person, text: `${problem} Tell me again when it was.` };
  return {
    kind: 'add',
    person,
    outing: {
      date,
      start,
      minutes,
      activity: activityOf(t),
      pin,
      trees: /park|garden|tree|green/iu.test(`${pin.name} ${t}`),
    },
  };
}

const ACTIVITY_HINDI: Readonly<Record<Activity, string>> = {
  walk: 'टहलना या दौड़ना',
  play: 'खेल',
  cycle: 'साइकिल',
  other: 'बाहर का समय',
};

/** What to say once an outing is added: what it was, and the air it counted. */
export function addedText(person: Person, outing: Omit<Outing, 'id'>, lang: Lang = 'en'): string {
  const open = ambientByHour(outing.pin, outing.date)[Math.floor(outing.start / 60)];
  const aqi = open === undefined ? undefined : usAqi(open)?.value;
  if (lang === 'hi') {
    const whose = person.id === 'me' ? 'आपके' : `${person.name} के`;
    const day = outing.date === today() ? 'आज' : formatDate(outing.date);
    return `${whose} दिन में जोड़ दिया: ${ACTIVITY_HINDI[outing.activity]}, ${outing.pin.name} में, ${clockOf(outing.start)} से ${String(outing.minutes)} मिनट, ${day}। ${
      aqi === undefined ? '' : `तब वहाँ की हवा एक्यूआई ${String(aqi)} थी। `
    }इसे बाहर की हवा के रूप में गिना गया${outing.trees ? ', पेड़ों की वजह से थोड़ा कम (अनुमानित)' : ''}। आप ${whose} बाहर के समय में इसे देख या हटा सकते हैं।`;
  }
  const what = ACTIVITY_LABELS[outing.activity].toLowerCase();
  const whose = person.id === 'me' ? 'your' : `${person.name}’s`;
  return `Added to ${whose} day: ${what} in ${outing.pin.name}, ${String(outing.minutes)} minutes from ${clockOf(outing.start)}, ${outing.date === today() ? 'today' : formatDate(outing.date)}. ${
    aqi === undefined ? '' : `The air there then was AQI ${String(aqi)}. `
  }It is counted as outside air${outing.trees ? ', a little lower for trees (assumed)' : ''}. You can see or remove it in ${whose} outdoor time.`;
}
