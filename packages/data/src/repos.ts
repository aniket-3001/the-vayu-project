import type { RawHour } from '@vayu/contracts';
import type { Point, Station } from './station';

/**
 * Public station data (build spec §7.1). Every method takes `asOf` so a fixture or fixed-clock
 * test behaves identically to a live call, and no implementation can hand back data from after
 * that instant (rule I1).
 */
export interface StationRepo {
  /** Stations worth considering near a point. Filter and pick the nearest with `nearestStation`. */
  stationsNear(point: Point, asOf: string): Promise<readonly Station[]>;
  /**
   * The hourly PM2.5/PM10 series for one station, only hours that had ended by `asOf`. `days` is how far back to
   * look (7 when left out, never more than 14).
   */
  hourlyFor(stationId: string, asOf: string, days?: number): Promise<readonly RawHour[]>;
}

/** The regional forecast for a point (build spec §6.3) — one grid cell, not street-level. */
export interface ForecastRepo {
  /** Hourly PM2.5/PM10 from `asOf` onward, for bias-correction against observed hours. */
  forecastFor(point: Point, asOf: string): Promise<readonly RawHour[]>;
}
