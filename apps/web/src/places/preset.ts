import { DEMO_PLACES } from '@vayu/contracts';
import { pinId, savePins, type Pin } from '../data/pins';
import { saveHousehold, type Household } from '../exposure/people';
import { sampleSpotsFor, saveSpots } from '../exposure/spots';
import { PINS_CHANGED } from './usePins';

const DETAIL: Readonly<Record<string, string>> = {
  Home: 'Dwarka, Delhi',
  School: 'South West Delhi',
  Office: 'Central Delhi',
  Park: 'Lodhi Garden, Delhi',
};

/** The four places of the preset: home, a child's school, an office and a park, in Delhi. Their air is read live. */
export const PRESET_PINS: readonly Pin[] = DEMO_PLACES.map((place) => ({
  id: pinId(place.lat, place.lng),
  name: place.name,
  detail: DETAIL[place.name] ?? 'Delhi',
  lat: place.lat,
  lng: place.lng,
}));

/** The family of the preset: a parent who works, and a child, Asha, who is nine and at school. */
export const PRESET_HOUSEHOLD: Household = {
  people: [
    { id: 'me', name: 'Me', age: 30, day: 'work' },
    { id: 'asha', name: 'Asha', age: 9, day: 'school' },
  ],
  current: 'me',
};

/**
 * Loads the preset profile: four places, two people and their usual days. It is a way to see the app with a profile
 * already there. The air at every place is the real, live reading; nothing about the air is made up. It replaces the
 * places and people on this device, so the screen asks first when there are some.
 */
export function applyPreset(storage: Storage): void {
  savePins(storage, PRESET_PINS);
  saveHousehold(storage, PRESET_HOUSEHOLD);
  saveSpots(storage, 'me', sampleSpotsFor('adult'));
  saveSpots(storage, 'asha', sampleSpotsFor('child'));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PINS_CHANGED));
}
