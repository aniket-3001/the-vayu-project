import { DEMO_PLACES } from '@vayu/contracts';
import type { LiveLog } from '../exposure/model';
import { sampleSpotsFor } from '../exposure/spots';
import type { Unit } from '../exposure/units';

const place = (id: string): { lat: number; lng: number } => {
  const found = DEMO_PLACES.find((p) => p.id === id);
  return { lat: found?.lat ?? 28.6, lng: found?.lng ?? 77.2 };
};

/** Units in the world, which anyone standing near gets the benefit of. Made up for the tests. */
export const SAMPLE_UNITS: readonly Unit[] = [
  { id: 'unit-school', name: 'Vayu unit at the school', ...place('school'), own: false },
  { id: 'unit-office', name: 'Vayu unit at the office', ...place('office'), own: false },
  {
    id: 'unit-friend',
    name: 'Vayu unit at a friend’s home',
    lat: 28.6139,
    lng: 77.209,
    own: false,
  },
];

const spotPin = (kind: 'work' | 'outdoor'): { lat: number; lng: number } => {
  const pin = sampleSpotsFor('adult')[kind]?.pin;
  return { lat: pin?.lat ?? 28.6, lng: pin?.lng ?? 77.2 };
};

/**
 * A made-up day of movement, so the live ring can be shown without waiting a day: a commute, a lunch
 * walk in the park, an errand across town, and the park again. It is labelled as a sample wherever it shows.
 */
export const SAMPLE_TRACK: LiveLog = {
  '8': { lat: 28.61, lng: 77.1 },
  '9': spotPin('work'),
  '10': spotPin('work'),
  '11': spotPin('work'),
  '12': spotPin('work'),
  '13': spotPin('outdoor'),
  '14': spotPin('work'),
  '15': { lat: 28.6139, lng: 77.209 },
  '16': { lat: 28.6139, lng: 77.209 },
  '17': spotPin('outdoor'),
};
