import { pinId, type Pin } from '../data/pins';
import { saveHousehold, type Household } from '../exposure/people';
import { saveSpots } from '../exposure/spots';

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
 * The two places the recording starts with: a home in south Delhi, near the R K Puram monitor, and Lodhi Garden
 * to walk in. No school and no office, so what each day shows is about the air itself: the GRAP stage, the fires, the
 * rain, the wind, the best hour for a walk, the windows. They are examples: the nearest monitor on each day is named.
 */
export const WEEK_PINS: readonly Pin[] = [
  {
    id: pinId(28.5702, 77.1884),
    name: 'Home',
    detail: 'Near R K Puram, South Delhi',
    lat: 28.5702,
    lng: 77.1884,
  },
  {
    id: pinId(28.5931, 77.2197),
    name: 'Park',
    detail: 'Lodhi Garden, New Delhi',
    lat: 28.5931,
    lng: 77.2197,
  },
];

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
  // Home, all day, at the first place: the person is mostly at home.
  const home = WEEK_PINS[0];
  if (home !== undefined) saveSpots(storage, 'me', { home: { pin: home, from: 0, to: 24 } });
  return storage;
}
