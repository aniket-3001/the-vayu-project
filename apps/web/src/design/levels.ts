/** The darkest colour we use: a greyed slate, not navy or black. Text on level colours, and the page's text. */
export const INK = '#334155';

export type Face = 'happy' | 'neutral' | 'concerned' | 'masked' | 'masked-worried' | 'masked-alarm';

export interface Level {
  readonly name: string;
  /** A word for tight places such as a chip. */
  readonly short: string;
  /** The strong colour: the status card, the chips, the dots. */
  readonly solid: string;
  /** Text on `solid`, chosen so the pair passes 4.5:1. */
  readonly onSolid: string;
  /** A faint tint of the same colour: washes and tiles. */
  readonly soft: string;
  readonly face: Face;
  /** The lowest US AQI in this level. */
  readonly from: number;
}

/**
 * The six US AQI levels, in IQAir's softer colours. Text on the strong colour is ink, not white:
 * white on coral is under 3:1, and the numbers on this screen are the whole point.
 */
export const LEVELS: readonly Level[] = [
  {
    name: 'Good',
    short: 'Good',
    solid: '#a9d67e',
    onSolid: INK,
    soft: '#eef7e3',
    face: 'happy',
    from: 0,
  },
  {
    name: 'Moderate',
    short: 'Moderate',
    solid: '#f7d65c',
    onSolid: INK,
    soft: '#fdf6d9',
    face: 'neutral',
    from: 51,
  },
  {
    name: 'Unhealthy for sensitive groups',
    short: 'Sensitive',
    solid: '#f7b56b',
    onSolid: INK,
    soft: '#fdebd6',
    face: 'concerned',
    from: 101,
  },
  {
    name: 'Unhealthy',
    short: 'Unhealthy',
    solid: '#f39595',
    onSolid: INK,
    soft: '#fde4e4',
    face: 'masked',
    from: 151,
  },
  {
    name: 'Very unhealthy',
    short: 'Very bad',
    solid: '#c4a3e3',
    onSolid: INK,
    soft: '#f0e6f8',
    face: 'masked-worried',
    from: 201,
  },
  {
    name: 'Hazardous',
    short: 'Hazardous',
    solid: '#b0527a',
    onSolid: '#ffffff',
    soft: '#f4dde6',
    face: 'masked-alarm',
    from: 301,
  },
];

/** The level a US AQI falls in. A value that makes no sense reads as the best level, never a crash. */
export function levelForAqi(aqi: number): Level {
  const first = LEVELS[0];
  if (first === undefined) throw new Error('No AQI levels defined');
  if (!Number.isFinite(aqi) || aqi < 0) return first;
  let found = first;
  for (const level of LEVELS) if (aqi >= level.from) found = level;
  return found;
}

/** The colours a GRAP stage wears, taken from the AQI scale: the level its air falls in. Stage IV is the deepest. */
export interface StageColours {
  readonly solid: string;
  readonly soft: string;
  readonly onSolid: string;
}
export const GRAP_COLOURS: Readonly<Record<1 | 2 | 3 | 4, StageColours>> = {
  1: { solid: '#f39595', soft: '#fde4e4', onSolid: INK },
  2: { solid: '#c4a3e3', soft: '#f0e6f8', onSolid: INK },
  3: { solid: '#b0527a', soft: '#f4dde6', onSolid: '#ffffff' },
  4: { solid: '#8a3560', soft: '#efd3e1', onSolid: '#ffffff' },
};
