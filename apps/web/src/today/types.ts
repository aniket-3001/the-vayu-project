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
  readonly weather: Weather;
}

export interface DailyPoint {
  /** Midnight at the start of the day, India time, ISO. */
  readonly date: string;
  readonly aqi: number;
  readonly hiC: number;
  readonly loC: number;
  readonly windKmh: number;
  readonly windFromDeg: number;
  readonly humidityPct: number;
  readonly rainChancePct: number;
  readonly condition: Condition;
}

/** Concentrations in µg/m³. */
export interface Pollutants {
  readonly pm25: number;
  readonly pm10: number;
  readonly o3: number;
  readonly no2: number;
  readonly so2: number;
  readonly co: number;
}

/** Where the numbers came from. Every screen shows this; it is the one thing we add to the design. */
export interface Provenance {
  /** `sample` means made up for the design; the screen says so. */
  readonly mode: 'live' | 'sample';
  readonly stationName: string;
  readonly distanceKm: number;
  readonly ageMinutes: number;
  readonly stations: number;
  readonly contributors: number;
}

export interface TodayData {
  readonly id: string;
  readonly place: { readonly name: string; readonly region: string };
  /** The moment the data describes, ISO. */
  readonly asOf: string;
  readonly aqi: number;
  readonly pm25: number;
  readonly weather: Weather;
  readonly pollutants: Pollutants;
  readonly hourly: readonly HourlyPoint[];
  readonly daily: readonly DailyPoint[];
  /** The past 48 hours of AQI, oldest first, ending at `asOf`. */
  readonly history: readonly { readonly at: string; readonly aqi: number; readonly pm25: number }[];
  readonly sun: { readonly sunrise: string; readonly sunset: string };
  readonly provenance: Provenance;
}

/** Where the Today screen gets its data. Sample today; the live API later. */
export interface TodaySource {
  load(): Promise<TodayData>;
}
