import type { Mode, Place, RawHour, WeatherNow } from '@vayu/contracts';

/** Everything the Today screen needs to know about a place, before any calculation. */
export interface PlaceObservations {
  readonly place: Place;
  readonly observed: readonly RawHour[];
  readonly asOf: string;
  readonly mode: Mode;
  /** True when the numbers are sample data, so the screen can say so. */
  readonly simulated: boolean;
  /** The weather model's value for now, when the API had one. */
  readonly weather?: WeatherNow | undefined;
  readonly station?: { readonly id: string; readonly name: string; readonly distanceKm: number };
}

export interface Coordinates {
  readonly lat: number;
  readonly lng: number;
}

/** A spot on the map, optionally with the name to show for it (a pinned place keeps its own name). */
export interface Located extends Coordinates {
  readonly name?: string;
}

/** Where observations come from. The app depends on this interface, not on a particular source. */
export interface DataSource {
  /** `where` is the person's own coordinates (from GPS); then `placeId` is only a label. */
  load(placeId: string, where?: Located): Promise<PlaceObservations>;
}
