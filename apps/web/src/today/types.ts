/** What the sky is doing. The screen picks the icon (a moon at night) from this and `isDay`. */
export type Condition =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'haze'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'thunderstorm'
  | 'windy'
  | 'dust';

export interface Weather {
  readonly condition: Condition;
  readonly isDay: boolean;
  readonly tempC: number;
  readonly humidityPct: number;
  readonly windKmh: number;
  /** The direction the wind comes from, in degrees (0 is north). */
  readonly windFromDeg: number;
  /** Chance of rain in the hour, 0 to 100. */
  readonly rainChancePct: number;
  /** Rain expected in the hour, in millimetres. */
  readonly rainMm: number;
  readonly uvIndex: number;
}

export interface HourlyPoint {
  /** The hour, ISO. */
  readonly at: string;
  readonly aqi: number;
  readonly pm25: number;
  /** Missing when the weather model had no answer for this hour. */
  readonly weather?: Weather;
}

/** The sky and the wind for one day. */
export interface DaySky {
  readonly hiC: number;
  readonly loC: number;
  readonly windKmh: number;
  readonly windFromDeg: number;
  readonly humidityPct: number;
  readonly rainChancePct: number;
  readonly condition: Condition;
}

export interface DailyPoint {
  /** Midnight at the start of the day, India time, ISO. */
  readonly date: string;
  /** Missing for the last days of the week, where the air forecast does not reach but the weather does. */
  readonly aqi?: number;
  /** Missing when the weather model had no answer for this day. */
  readonly sky?: DaySky;
}

/**
 * Concentrations in µg/m³. PM2.5 is the reading itself. The others come from a regional model, so any of them can
 * be missing.
 */
export interface Pollutants {
  readonly pm25: number;
  readonly pm10?: number;
  readonly o3?: number;
  readonly no2?: number;
  readonly so2?: number;
  readonly co?: number;
}

/**
 * Where the number came from and how old it is (rule I2). `label` is the trust level: a nearby monitor with a recent
 * reading, a model estimate where none has reported lately, or made-up days in the tests.
 */
export interface Provenance {
  readonly mode: 'live' | 'model' | 'sample';
  readonly label: 'Nearby station' | 'Estimate' | 'Sample';
  readonly stationName?: string;
  readonly distanceKm?: number;
  /** How old the reading is, in minutes. */
  readonly ageMinutes: number;
}

export interface TodayData {
  readonly id: string;
  readonly place: { readonly name: string; readonly region: string };
  /** The moment the data describes, ISO. */
  readonly asOf: string;
  readonly aqi: number;
  readonly pm25: number;
  /** Missing when the weather model had no answer. */
  readonly weather?: Weather;
  /** Where the gases came from, when there are any. */
  readonly pollutants: Pollutants;
  readonly hourly: readonly HourlyPoint[];
  readonly daily: readonly DailyPoint[];
  /** The past 48 hours of AQI, oldest first, ending at `asOf`. */
  readonly history: readonly { readonly at: string; readonly aqi: number; readonly pm25: number }[];
  readonly sun?: { readonly sunrise: string; readonly sunset: string };
  readonly provenance: Provenance;
}

/** Where the Today screen gets its data. Sample today; the live API later. */
export interface TodaySource {
  load(): Promise<TodayData>;
}
