import { DEMO_PLACES } from '@vayu/contracts';
import { pinId, type Pin } from '../data/pins';
import { saveHousehold, type Household } from '../exposure/people';
import { sampleSpotsFor, saveSpots } from '../exposure/spots';

/** A storage that lives only as long as the page: what the recorded week keeps, so the person's own data is untouched. */
export class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  get length(): number {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

/** The four places a household starts with in the recording: home, school, work and a park. */
export const WEEK_PINS: readonly Pin[] = DEMO_PLACES.map((place) => ({
  id: pinId(place.lat, place.lng),
  name: place.name,
  lat: place.lat,
  lng: place.lng,
}));

/** The household of the recording: the phone's owner, who works, and a child at school. */
export const WEEK_HOUSEHOLD: Household = {
  people: [
    { id: 'me', name: 'Me', age: 30, day: 'work' },
    { id: 'asha', name: 'Asha', age: 9, day: 'school' },
  ],
  current: 'me',
};

/**
 * Puts a storage of its own in place of the browser's for the rest of the page, and fills it with the household. The
 * app reads `window.localStorage` wherever it keeps something, so nothing the person saved is read, and nothing done
 * while the recording plays is kept after the page is left.
 */
export function installMemoryStorage(): Storage {
  const storage = new MemoryStorage();
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  saveHousehold(storage, WEEK_HOUSEHOLD);
  saveSpots(storage, 'me', sampleSpotsFor('adult'));
  saveSpots(storage, 'asha', sampleSpotsFor('child'));
  return storage;
}
