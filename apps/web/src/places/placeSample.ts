import { readDemo } from '../demo/state';
import { DEMO_PLACES } from '../data/places';
import { pinId, type Pin } from '../data/pins';
import { SAMPLE_IDS, sampleDay, type SampleId } from '../today/sample';
import type { TodayData } from '../today/types';

/**
 * Which made-up day each of the four starter places gets, so the list shows the whole range:
 * the park is clean, the office hazy, home is unhealthy, school sits in the dust.
 */
const STARTERS: Readonly<Record<string, SampleId>> = Object.fromEntries(
  DEMO_PLACES.map((place): [string, SampleId] => [
    pinId(place.lat, place.lng),
    { home: 'unhealthy', school: 'dusty', office: 'moderate', park: 'good' }[place.id] as SampleId,
  ]),
);

/** A small stable number from text, so a searched place always gets the same made-up day. */
const hash = (text: string): number => {
  let h = 0;
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  return h;
};

export const sampleIdForPin = (pin: Pin): SampleId =>
  readDemo()?.day ?? STARTERS[pin.id] ?? SAMPLE_IDS[hash(pin.id) % SAMPLE_IDS.length] ?? 'moderate';

/** A pin's made-up reading, wearing the pin's own name. Replaced by the real reading once the API is plugged in. */
export function readingForPin(pin: Pin, day: SampleId = sampleIdForPin(pin)): TodayData {
  return {
    ...sampleDay(day),
    id: pin.id,
    place: { name: pin.name, region: pin.detail ?? 'Delhi NCR' },
  };
}
