import { LEVELS, levelForAqi, type Level } from '../design/levels';
import type { Pollutants } from './types';

export type PollutantKey = keyof Pollutants;

export interface PollutantInfo {
  readonly key: PollutantKey;
  /** Shown as the tile title; the subscript is drawn by the screen. */
  readonly label: string;
  readonly plain: string;
  readonly unit: string;
  /**
   * Upper bounds of the first five levels, in this tile's unit: the US EPA breakpoints, with the
   * gases converted from ppb or ppm at 25 °C. Only for choosing a dot colour: a rough guide, not
   * an index of its own.
   */
  readonly upTo: readonly [number, number, number, number, number];
}

export const POLLUTANTS: readonly PollutantInfo[] = [
  {
    key: 'pm25',
    label: 'PM2.5',
    plain: 'Fine particles',
    unit: 'µg/m³',
    upTo: [9, 35.4, 55.4, 125.4, 225.4],
  },
  {
    key: 'pm10',
    label: 'PM10',
    plain: 'Coarse dust',
    unit: 'µg/m³',
    upTo: [54, 154, 254, 354, 424],
  },
  { key: 'o3', label: 'O3', plain: 'Ozone', unit: 'µg/m³', upTo: [106, 137, 167, 206, 392] },
  {
    key: 'no2',
    label: 'NO2',
    plain: 'Nitrogen dioxide',
    unit: 'µg/m³',
    upTo: [100, 188, 677, 1220, 2350],
  },
  {
    key: 'so2',
    label: 'SO2',
    plain: 'Sulphur dioxide',
    unit: 'µg/m³',
    upTo: [92, 197, 485, 797, 1582],
  },
  {
    key: 'co',
    label: 'CO',
    plain: 'Carbon monoxide',
    unit: 'µg/m³',
    upTo: [5038, 10763, 14198, 17633, 34808],
  },
];

/** The level a reading falls in, for the dot beside it. */
export function levelForReading(info: PollutantInfo, value: number): Level {
  const index = info.upTo.findIndex((bound) => value <= bound);
  return LEVELS[index === -1 ? 5 : index] ?? levelForAqi(500);
}
