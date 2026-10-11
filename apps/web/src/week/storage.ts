import { DEMO_PLACES } from '@vayu/contracts';
import { pinId, type Pin } from '../data/pins';
import { saveHousehold, type Household } from '../exposure/people';
import { sampleSpotsFor, saveSpots } from '../exposure/spots';

/** A storage that lives only as long as the page: what the recorded days keeps, so the person's own data is untouched. */
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

/**
 * The two places the recording starts with: home, and a park to walk in. No school and no office, so what each day
 * shows is about the air itself: the GRAP stage, the fires, the rain, the wind, the best hour for a walk, the windows.
 */
export const WEEK_PINS: readonly Pin[] = DEMO_PLACES.filter(
  (place) => place.name === 'Home' || place.name === 'Park',
).map((place) => ({
  id: pinId(place.lat, place.lng),
  name: place.name,
  lat: place.lat,
  lng: place.lng,
}));

/** The household of the recording: one person, who is mostly at home. */
export const WEEK_HOUSEHOLD: Household = {
  people: [{ id: 'me', name: 'Me', age: 30, day: 'none' }],
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
  saveSpots(storage, 'me', sampleSpotsFor('senior'));
  return storage;
}
