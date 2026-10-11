import { walkAdviceFor } from '@vayu/core';
import { assemblyFor } from '../alerts/assembly';
import { ROMAN } from '../alerts/model';
import { grapStageFor } from '../tasks/model';
import type { Pin } from '../data/pins';
import { bestHour, lensSeries } from '../lens/model';
import { hourRange, hourOfDay, isoDate } from '../today/time';
import type { TodayData } from '../today/types';
import { isSchoolPin, roleOfLabel } from './roles';

/** What a place is, for the one thing worth saying about it: a school, a park, or any other place. */
export type NoteKind = 'assembly' | 'walk' | 'clean';

/** One thing worth knowing about a place: a short line for its card, and the full words for its page. */
export interface PlaceNote {
  readonly kind: NoteKind;
  /** The heading of the full note: "Morning assembly", "Best time for a walk". */
  readonly title: string;
  /** One line, for a card: "Morning assembly: Inside". */
  readonly short: string;
  /** The words for the place's page. */
  readonly long: string;
  /** What the guidance comes to, as short lines for the page. */
  readonly rules: readonly string[];
}

const PARKISH = /\b(park|garden|playground|ground|trail|lake)\b/iu;

/** Whether a place is a park: called one, or named for one. */
export function isParkPin(pin: Pin): boolean {
  return roleOfLabel(pin.name) === 'outdoor' || PARKISH.test(pin.name);
}

/**
 * The one thing to say about a place: where a school's morning assembly should be, the best time for a walk in a
 * park, and for any other place the cleanest daylight hour ahead. Undefined only when there is no daylight hour left
 * to name. Our advice, never an order.
 */
export function placeNote(data: TodayData, pin: Pin): PlaceNote | undefined {
  if (isSchoolPin(pin)) {
    const assembly = assemblyFor(data);
    const closed = assembly.where === 'closed';
    return {
      kind: 'assembly',
      title: closed ? 'School is likely closed' : 'Morning assembly',
      short: closed ? 'School likely closed' : `Morning assembly: ${assembly.label}`,
      // The page shows the rules as lines, so the paragraph only says why.
      long: assembly.basis,
      rules: assembly.rules,
    };
  }
  const best = bestHour(lensSeries(data));
  if (best === undefined) return undefined;
  const when = `${hourRange(Math.floor(hourOfDay(best.at)))}${isoDate(best.at) === isoDate(data.asOf) ? '' : ' tomorrow'}`;
  const advice = walkAdviceFor(best.aqi);
  const stage = grapStageFor(data);
  const numeral = ROMAN[stage];
  const park = isParkPin(pin);
  // A GRAP stage from II up advises against outdoor walks and exercise: the cleanest hour is then only for going out
  // when you must. Stage I asks to limit time outside.
  if (stage >= 2) {
    return {
      kind: park ? 'walk' : 'clean',
      title: park ? 'Avoid walks here for now' : 'Stay in where you can',
      short: park ? `No walks: GRAP ${numeral}` : `Stay in: GRAP ${numeral}`,
      long: `The air here is in the GRAP Stage ${numeral} band, so skip outdoor walks and exercise${stage >= 3 ? ' and avoid going out unless you must' : ''}. If you must go out, the cleanest daylight hour is ${when} (AQI ${String(best.aqi)}); wear a well-fitted N95.`,
      rules: [
        'Move walks and exercise indoors.',
        `If you must go out, ${when} is the cleanest daylight hour (AQI ${String(best.aqi)}).`,
        'Wear a well-fitted N95 or FFP2 mask, and keep it short.',
      ],
    };
  }
  if (park) {
    return {
      kind: 'walk',
      title: 'Best time for a walk here',
      short: stage === 1 ? `Short walk: ${when}` : `Best walk: ${when}`,
      long: `${when}, when the air is cleanest in daylight (AQI ${String(best.aqi)}). ${advice.long}${stage === 1 ? ' The air here is in the GRAP Stage I band, so limit time outside.' : ''}`,
      rules: [
        advice.short,
        ...(stage === 1 ? ['GRAP Stage I band here: limit time outside.'] : []),
      ],
    };
  }
  return {
    kind: 'clean',
    title: 'Cleanest daylight hour',
    short: `Cleanest hour: ${when}`,
    long: `${when} (AQI ${String(best.aqi)}). ${advice.long}${stage === 1 ? ' The air here is in the GRAP Stage I band, so limit time outside.' : ''}`,
    rules: [advice.short, ...(stage === 1 ? ['GRAP Stage I band here: limit time outside.'] : [])],
  };
}
