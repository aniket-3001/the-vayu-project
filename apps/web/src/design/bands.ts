import type { Band } from '@vayu/contracts';
import { usAqi } from '@vayu/core';

/** The six CPCB bands as the viewer sees them: a colour, a readable label colour and a name. */
export interface BandStyle {
  readonly name: string;
  readonly background: string;
  readonly foreground: string;
  /** How much of the ring glyph is filled, so colour is never the only signal. */
  readonly fill: number;
}

export const BAND_STYLES: Readonly<Record<Band, BandStyle>> = {
  good: { name: 'Good', background: '#1b7f3b', foreground: '#ffffff', fill: 1 / 6 },
  satisfactory: { name: 'Satisfactory', background: '#8bc34a', foreground: '#14210a', fill: 2 / 6 },
  moderate: { name: 'Moderate', background: '#f7d117', foreground: '#2a2300', fill: 3 / 6 },
  poor: { name: 'Poor', background: '#f28c28', foreground: '#2b1500', fill: 4 / 6 },
  very_poor: { name: 'Very poor', background: '#d93a3a', foreground: '#ffffff', fill: 5 / 6 },
  severe: { name: 'Severe', background: '#7b1e3a', foreground: '#ffffff', fill: 1 },
};

/** US AQI colours, one per level from Good to Hazardous (the EPA's hues, darkened where needed to stay readable). */
export const US_AQI_STYLES: readonly {
  readonly background: string;
  readonly foreground: string;
}[] = [
  { background: '#3fae49', foreground: '#08210c' },
  { background: '#f5d90a', foreground: '#2a2300' },
  { background: '#f28c28', foreground: '#2b1500' },
  { background: '#d93a3a', foreground: '#ffffff' },
  { background: '#8f3f97', foreground: '#ffffff' },
  { background: '#7e0023', foreground: '#ffffff' },
];

/** The ring glyph fills by level; these are the bands with the matching fill. */
export const US_AQI_GLYPH_BANDS: readonly Band[] = [
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'very_poor',
  'severe',
];

export interface UsStyle {
  readonly value: number;
  readonly category: string;
  readonly level: number;
  readonly background: string;
  readonly foreground: string;
  /** A band whose ring fill matches this level, for the glyph. */
  readonly glyphBand: Band;
}

/** How a PM2.5 concentration looks in the US AQI: number, name, colours. Every screen uses this. */
export function usStyleFor(pm25: number | null): UsStyle | undefined {
  if (pm25 === null) return undefined;
  const aqi = usAqi(pm25);
  if (aqi === undefined) return undefined;
  const colours = US_AQI_STYLES[aqi.level];
  const glyphBand = US_AQI_GLYPH_BANDS[aqi.level];
  if (colours === undefined || glyphBand === undefined) return undefined;
  return { ...aqi, ...colours, glyphBand };
}
