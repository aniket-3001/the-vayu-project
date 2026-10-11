import { walkAdviceFor } from '@vayu/core';
import { assemblyFor } from '../alerts/assembly';
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
    return {
      kind: 'assembly',
      title: 'Morning assembly',
      short: `Morning assembly: ${assembly.label}`,
      long: assembly.words,
    };
  }
  const best = bestHour(lensSeries(data));
  if (best === undefined) return undefined;
  const when = `${hourRange(Math.floor(hourOfDay(best.at)))}${isoDate(best.at) === isoDate(data.asOf) ? '' : ' tomorrow'}`;
  const advice = walkAdviceFor(best.aqi);
  if (isParkPin(pin)) {
    return {
      kind: 'walk',
      title: 'Best time for a walk here',
      short: `Best walk: ${when}`,
      long: `${when}, when the air is cleanest in daylight (AQI ${String(best.aqi)}). ${advice.long}`,
    };
  }
  return {
    kind: 'clean',
    title: 'Cleanest daylight hour',
    short: `Cleanest hour: ${when}`,
    long: `${when} (AQI ${String(best.aqi)}). ${advice.long}`,
  };
}
