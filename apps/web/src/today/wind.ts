const POINTS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const;

/** Which way an arrow should point: where the wind is going, not where it comes from. */
export const arrowRotation = (fromDeg: number): number => (fromDeg + 180) % 360;

/** "north-west", for a wind that comes from 315°. */
export const compassPoint = (fromDeg: number): string =>
  POINTS[Math.round((((fromDeg % 360) + 360) % 360) / 45) % 8] ?? 'north';

/** "from the north-west", for screen readers. */
export const windFrom = (fromDeg: number): string => `from the ${compassPoint(fromDeg)}`;
