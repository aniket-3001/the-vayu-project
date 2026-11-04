import type { MapStation } from '@vayu/contracts';
import { useEffect, useSyncExternalStore } from 'react';
import { noteAir } from '../analytics';
import { nowIso } from '../clock';
import type { Pin } from '../data/pins';
import { hourOfDay, isoDate } from '../today/time';
import type { TodayData } from '../today/types';
import type { AirSource, HourPm, Loaded } from './types';

/** A reading is looked up again after this long, and whenever the person comes back to the page. */
const REFRESH_MS = 5 * 60_000;
/** After a failure, wait this long before trying again on its own. */
const RETRY_MS = 20_000;

type Entry<T> =
  | { readonly status: 'loading'; readonly at: number }
  | {
      readonly status: 'ready';
      readonly data: T;
      readonly at: number;
      /** When this data was fetched (or saved, if it came back from storage). `at` moves on a refresh; this does not. */
      readonly loadedAt?: number;
    }
  | { readonly status: 'error'; readonly message: string; readonly at: number };

/** Hours of each India calendar date, 0 to 23, with `undefined` where nothing was measured. */
type Ambient = ReadonlyMap<string, readonly (number | undefined)[]>;

/**
 * A saved reading is brought back after a restart only while it is younger than this. It is the same limit the rules use
 * for a monitor's reading (`rules.trust.unusableMin`, three hours): past it, no advice is given from a reading, so there
 * is nothing useful to show.
 */
const RESTORE_MAX_MS = 180 * 60_000;
const SAVED_PREFIX = 'vayu.air.v1.';

function defaultStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

const EMPTY_DAY: readonly (number | undefined)[] = Array.from({ length: 24 }, () => undefined);

function indexHours(hours: readonly HourPm[]): Ambient {
  const days = new Map<string, (number | undefined)[]>();
  for (const { t, pm25 } of hours) {
    if (pm25 === null) continue;
    const date = isoDate(t);
    const day = days.get(date) ?? Array.from({ length: 24 }, () => undefined);
    day[Math.floor(hourOfDay(t))] = pm25;
    days.set(date, day);
  }
  return days;
}

const messageOf = (error: unknown): string =>
  error instanceof Error && error.message !== ''
    ? error.message
    : 'The air data could not be loaded.';

/**
 * The one place the app keeps what it knows about the air: a place's reading, the last two weeks of its hours,
 * and the monitors on the map. Screens read from it and ask it to load; it dedupes, remembers, refreshes and
 * says plainly when something failed. It never makes a number up: a place with no data has none.
 */
export class AirStore {
  private readonly todays = new Map<string, Entry<TodayData>>();
  private readonly histories = new Map<string, Entry<Ambient>>();
  private monitors: Entry<readonly MapStation[]> | undefined;
  private readonly listeners = new Set<() => void>();
  private version = 0;

  /** The made-up units and movement the test source can give, or undefined for the live source. */
  madeUpExposure(): ReturnType<NonNullable<AirSource['peekExposure']>> | undefined {
    return this.source.peekExposure?.();
  }

  /** The made-up map data the test source can give, or undefined for the live source. */
  madeUpMap(): ReturnType<NonNullable<AirSource['peekMap']>> | undefined {
    return this.source.peekMap?.();
  }

  /** Whether this store runs on made-up days. The map and the labels ask. */
  get kind(): 'live' | 'sample' {
    return this.source.kind;
  }

  /** Today's readings as shown, with the age moved on to now. Kept so a screen gets the same object until the minute changes. */
  private readonly aged = new Map<string, { data: TodayData; extra: number; out: TodayData }>();

  constructor(
    private readonly source: AirSource,
    private readonly clockMs: () => number = Date.now,
    /** Where the last good readings are kept, so a restart with no network still has something honest to show. */
    private readonly storage: Storage | undefined = defaultStorage(),
  ) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly snapshot = (): number => this.version;

  private changed(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  // Reading

  today(pin: Pin): Loaded<TodayData> {
    if (this.todays.get(pin.id) === undefined) {
      const peeked = this.source.peekToday?.(pin);
      if (peeked !== undefined)
        this.todays.set(pin.id, { status: 'ready', data: peeked, at: this.clockMs() });
      else {
        const saved = this.restore(pin);
        if (saved !== undefined) this.todays.set(pin.id, saved);
      }
    }
    const entry = this.todays.get(pin.id);
    return entry?.status === 'ready'
      ? { status: 'ready', data: this.withAge(pin.id, entry.data, entry.loadedAt) }
      : this.view(entry);
  }

  /**
   * A reading says how old it was when it was fetched. Left like that it would keep saying "5 minutes" for as long as
   * it stayed on screen, so the minutes since it arrived are added on. (A model estimate has no age to move on.)
   */
  private withAge(id: string, data: TodayData, loadedAt: number | undefined): TodayData {
    if (loadedAt === undefined || data.provenance.label !== 'Nearby station') return data;
    const extra = Math.max(0, Math.floor((this.clockMs() - loadedAt) / 60_000));
    if (extra === 0) return data;
    const cached = this.aged.get(id);
    if (cached?.data === data && cached.extra === extra) return cached.out;
    const out: TodayData = {
      ...data,
      provenance: { ...data.provenance, ageMinutes: data.provenance.ageMinutes + extra },
    };
    this.aged.set(id, { data, extra, out });
    return out;
  }

  private persist(pin: Pin, data: TodayData): void {
    if (this.source.kind !== 'live' || this.storage === undefined) return;
    try {
      this.storage.setItem(
        SAVED_PREFIX + pin.id,
        JSON.stringify({ savedAt: this.clockMs(), data }),
      );
    } catch {
      // Storage full or not allowed: the app works the same, it just cannot show this reading after a restart.
    }
  }

  private restore(pin: Pin): Entry<TodayData> | undefined {
    if (this.source.kind !== 'live' || this.storage === undefined) return undefined;
    try {
      const raw = this.storage.getItem(SAVED_PREFIX + pin.id);
      if (raw === null) return undefined;
      const saved = JSON.parse(raw) as { savedAt?: unknown; data?: TodayData };
      const age = typeof saved.savedAt === 'number' ? this.clockMs() - saved.savedAt : Number.NaN;
      if (!(age >= 0 && age <= RESTORE_MAX_MS) || saved.data?.id !== pin.id) {
        this.storage.removeItem(SAVED_PREFIX + pin.id);
        return undefined;
      }
      return {
        status: 'ready',
        data: saved.data,
        at: saved.savedAt as number,
        loadedAt: saved.savedAt as number,
      };
    } catch {
      return undefined;
    }
  }

  /** The open-air PM2.5 for each hour of a date at a place, `undefined` for an hour nothing was measured. */
  ambient(pin: Pin, date: string): readonly (number | undefined)[] {
    this.peekHistory(pin);
    const entry = this.histories.get(pin.id);
    return entry?.status === 'ready' ? (entry.data.get(date) ?? EMPTY_DAY) : EMPTY_DAY;
  }

  historyStatus(pin: Pin): Loaded<true> {
    this.peekHistory(pin);
    const entry = this.histories.get(pin.id);
    if (entry === undefined || entry.status === 'loading') return { status: 'loading' };
    return entry.status === 'ready'
      ? { status: 'ready', data: true }
      : { status: 'error', message: entry.message };
  }

  stationsNow(): Loaded<readonly MapStation[]> {
    if (this.monitors === undefined) {
      const peeked = this.source.peekStations?.();
      if (peeked !== undefined)
        this.monitors = { status: 'ready', data: peeked, at: this.clockMs() };
    }
    return this.view(this.monitors);
  }

  private peekHistory(pin: Pin): void {
    if (this.histories.get(pin.id) !== undefined) return;
    const peeked = this.source.peekHistory?.(pin);
    if (peeked !== undefined)
      this.histories.set(pin.id, { status: 'ready', data: indexHours(peeked), at: this.clockMs() });
  }

  private view<T>(entry: Entry<T> | undefined): Loaded<T> {
    if (entry === undefined || entry.status === 'loading') return { status: 'loading' };
    return entry.status === 'ready'
      ? { status: 'ready', data: entry.data }
      : { status: 'error', message: entry.message };
  }

  // Loading

  /** Starts a load if there is none, the one there is old, or the last one failed a while ago. `force` always loads. */
  ensureToday(pin: Pin, force = false): void {
    this.load(
      this.todays,
      pin.id,
      () => this.source.today(pin),
      force,
      (data) => {
        this.persist(pin, data);
      },
    );
  }
  ensureHistory(pin: Pin, force = false): void {
    this.peekHistory(pin);
    this.load(
      this.histories,
      pin.id,
      async () => indexHours(await this.source.history(pin)),
      force,
    );
  }
  ensureStations(force = false): void {
    const entry = this.monitors;
    if (!force && this.fresh(entry)) return;
    const previous = entry?.status === 'ready' ? entry : undefined;
    this.monitors = previous ?? { status: 'loading', at: this.clockMs() };
    this.source.stations().then(
      (data) => {
        this.monitors = { status: 'ready', data, at: this.clockMs() };
        this.changed();
      },
      (error: unknown) => {
        this.monitors = previous ?? {
          status: 'error',
          message: messageOf(error),
          at: this.clockMs(),
        };
        this.changed();
      },
    );
  }

  private fresh<T>(entry: Entry<T> | undefined): boolean {
    if (entry === undefined) return false;
    const age = this.clockMs() - entry.at;
    if (entry.status === 'loading') return age < 30_000;
    return entry.status === 'ready' ? age < REFRESH_MS : age < RETRY_MS;
  }

  private load<T>(
    map: Map<string, Entry<T>>,
    key: string,
    fetcher: () => Promise<T>,
    force: boolean,
    onReady?: (data: T) => void,
  ): void {
    const entry = map.get(key);
    if (!force && this.fresh(entry)) return;
    // While refreshing, the old answer stays on screen: a reading is only replaced by a newer one, or kept.
    const previous = entry?.status === 'ready' ? entry : undefined;
    if (previous === undefined) {
      map.set(key, { status: 'loading', at: this.clockMs() });
      this.changed();
    } else map.set(key, { ...previous, at: this.clockMs() });
    fetcher().then(
      (data) => {
        map.set(key, { status: 'ready', data, at: this.clockMs(), loadedAt: this.clockMs() });
        onReady?.(data);
        this.changed();
      },
      (error: unknown) => {
        map.set(
          key,
          previous ?? { status: 'error', message: messageOf(error), at: this.clockMs() },
        );
        this.changed();
      },
    );
  }

  /** Forget everything, for a retry from scratch. */
  clear(): void {
    if (this.storage !== undefined) {
      try {
        for (const key of Object.keys(this.storage).filter((k) => k.startsWith(SAVED_PREFIX)))
          this.storage.removeItem(key);
      } catch {
        // Nothing to forget if storage cannot be read.
      }
    }
    this.aged.clear();
    this.todays.clear();
    this.histories.clear();
    this.monitors = undefined;
    this.changed();
  }
}

// The store the app runs on. Set once at start-up; tests set their own.

let current: AirStore | undefined;
let make: (() => AirStore) | undefined;

/** How the first store is made, when nothing has set one: the app's start-up decides (live, or made-up days). */
export function setAirStoreFactory(factory: () => AirStore): void {
  make = factory;
  current = undefined;
}
export function setAirStore(store: AirStore): void {
  current = store;
}
export function airStore(): AirStore {
  if (current === undefined) {
    if (make === undefined)
      throw new Error('No air source is set: call setAirStoreFactory at start-up');
    current = make();
  }
  return current;
}

// React

/** Re-renders when the store changes, and loads (and keeps fresh) the reading for a place. */
export function useToday(pin: Pin | undefined): Loaded<TodayData> | undefined {
  const store = airStore();
  useSyncExternalStore(store.subscribe, store.snapshot);
  const id = pin?.id;
  useEffect(() => {
    if (pin === undefined) return undefined;
    store.ensureToday(pin);
    const again = (): void => {
      if (document.visibilityState === 'visible') store.ensureToday(pin);
    };
    document.addEventListener('visibilitychange', again);
    const timer = window.setInterval(again, REFRESH_MS);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.clearInterval(timer);
    };
    // The pin's coordinates are its id.
  }, [id, store]);
  const loaded = pin === undefined ? undefined : store.today(pin);
  const aqi = loaded?.status === 'ready' ? loaded.data.aqi : undefined;
  // The air this person is looking at, so what they do can be told apart by how the air was.
  useEffect(() => {
    noteAir(aqi);
  }, [aqi]);
  return loaded;
}

/** The same for each of several places: the readings by pin id. */
export function useTodays(pins: readonly Pin[]): ReadonlyMap<string, Loaded<TodayData>> {
  const store = airStore();
  useSyncExternalStore(store.subscribe, store.snapshot);
  const ids = pins.map((p) => p.id).join('|');
  useEffect(() => {
    for (const pin of pins) store.ensureToday(pin);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') for (const pin of pins) store.ensureToday(pin);
    }, REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
    // The pins' coordinates are their ids.
  }, [ids, store]);
  const byPin = new Map(pins.map((p) => [p.id, store.today(p)]));
  const first = pins[0] === undefined ? undefined : byPin.get(pins[0].id);
  const aqi = first?.status === 'ready' ? first.data.aqi : undefined;
  // On the home screen the first place is the one they see first.
  useEffect(() => {
    noteAir(aqi);
  }, [aqi]);
  return byPin;
}

/** Loads the last two weeks of hours for these places and re-renders as they arrive. */
export function useHistory(pins: readonly Pin[]): 'loading' | 'ready' | 'error' {
  const store = airStore();
  useSyncExternalStore(store.subscribe, store.snapshot);
  const ids = pins.map((p) => p.id).join('|');
  useEffect(() => {
    for (const pin of pins) {
      store.ensureHistory(pin);
      // The hour in progress has no finished reading, so it borrows the reading from now.
      store.ensureToday(pin);
    }
    // The pins' coordinates are their ids.
  }, [ids, store]);
  const states = pins.map((p) => store.historyStatus(p).status);
  if (states.includes('loading')) return 'loading';
  return states.includes('error') ? 'error' : 'ready';
}

/** The monitors on the map. */
export function useStations(): Loaded<readonly MapStation[]> {
  const store = airStore();
  useSyncExternalStore(store.subscribe, store.snapshot);
  useEffect(() => {
    store.ensureStations();
  }, [store]);
  return store.stationsNow();
}

/** The time, for code that should not call `Date`: the app's clock. */
export const airNow = nowIso;
