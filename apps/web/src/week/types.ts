/**
 * The recorded days, as `scripts/record-week.mjs` writes it. Every series is hourly from India midnight of
 * `seriesFrom`, `hours` long, with null where nothing was measured.
 */
export interface RecordedStation {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

export interface RecordedFire {
  readonly lat: number;
  readonly lng: number;
  readonly hoursAgo: number;
  readonly frp: number;
}

export interface RecordedDay {
  /** The India calendar date, "2025-10-21". */
  readonly date: string;
  readonly title: string;
  readonly tags: readonly string[];
  /** The moment the app takes as "now" on this day, ISO. */
  readonly asOf: string;
  readonly seriesFrom: string;
  readonly hours: number;
  readonly air: Readonly<
    Record<
      string,
      { readonly pm25: readonly (number | null)[]; readonly pm10: readonly (number | null)[] }
    >
  >;
  readonly weather: {
    readonly temperatureC: readonly (number | null)[];
    readonly humidityPct: readonly (number | null)[];
    readonly precipitationMm: readonly (number | null)[];
    readonly code: readonly (number | null)[];
    readonly windKmh: readonly (number | null)[];
    readonly windFromDeg: readonly (number | null)[];
    readonly isDay: readonly (number | null)[];
    readonly sunrise: readonly string[];
    readonly sunset: readonly string[];
  };
  readonly gases: {
    readonly o3: readonly (number | null)[];
    readonly no2: readonly (number | null)[];
    readonly so2: readonly (number | null)[];
    readonly co: readonly (number | null)[];
  };
  readonly fires: readonly RecordedFire[];
}

export interface Recorded {
  readonly version: 1;
  readonly recordedAt: string;
  readonly sources: {
    readonly air: string;
    readonly weather: string;
    readonly gases: string;
    readonly fires: string;
  };
  readonly stations: readonly RecordedStation[];
  readonly days: readonly RecordedDay[];
}
