import type { MapStation } from '@vayu/contracts';
import type { Pin } from '../data/pins';
import type { TodayData } from '../today/types';

/** One hour of PM2.5 at a place, the hour starting at `t`, or null where nothing was measured. */
export interface HourPm {
  readonly t: string;
  readonly pm25: number | null;
}

/** What a screen sees while data comes in: not there yet, there, or failed (with words a person can read). */
export type Loaded<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'error'; readonly message: string };

/**
 * Where the air comes from. The deployed app asks our API on AWS; the prototype build and the tests use made-up
 * days. A source that can answer at once (the made-up one) also offers `peek*`, so a screen can draw without
 * waiting; the live one cannot, and the store shows "loading" until it answers.
 */
export interface AirSource {
  /** `live` is our API on AWS; `sample` is made-up days, for the prototype build and the tests. */
  readonly kind: 'live' | 'sample';
  peekToday?(pin: Pin): TodayData | undefined;
  peekHistory?(pin: Pin): readonly HourPm[] | undefined;
  peekStations?(): readonly MapStation[] | undefined;
  today(pin: Pin): Promise<TodayData>;
  /** The hourly PM2.5 at a place over the last fourteen days. */
  history(pin: Pin): Promise<readonly HourPm[]>;
  stations(): Promise<readonly MapStation[]>;
}
