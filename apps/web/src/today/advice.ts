import { LEVELS } from '../design/levels';

export type AdviceIcon =
  'walk' | 'open-windows' | 'exercise' | 'windows' | 'mask' | 'purifier' | 'indoors';

export interface Advice {
  readonly icon: AdviceIcon;
  readonly text: string;
}

/** One plain sentence under the number, by level. It gets quieter as the air gets worse. */
const HEADLINES: readonly string[] = [
  'Clean air. A good day to open the windows.',
  'Fine for most people. If you are unusually sensitive, go easy outside.',
  'People sensitive to air pollution should spend less time outside.',
  'Everyone may feel it. Keep outdoor time short and skip hard exercise.',
  'Stay in where you can. Outside, wear a mask and keep it gentle.',
  'The air is hazardous. Keep windows shut and keep children in.',
];

/** What to do, by level, from the US EPA's guidance. General advice, not medical advice. */
const ADVICE: readonly (readonly Advice[])[] = [
  [
    { icon: 'open-windows', text: 'Open the windows to let fresh air in' },
    { icon: 'walk', text: 'Outdoor exercise and walks are fine' },
  ],
  [
    { icon: 'walk', text: 'Outdoor activity is fine for most people' },
    { icon: 'exercise', text: 'If you are sensitive, take it easier on long outdoor efforts' },
  ],
  [
    { icon: 'exercise', text: 'Sensitive people: cut down on long or hard outdoor exercise' },
    { icon: 'windows', text: 'Sensitive people: keep windows shut at the worst hours' },
    { icon: 'purifier', text: 'Run an air purifier if you have one' },
  ],
  [
    { icon: 'exercise', text: 'Avoid outdoor exercise' },
    { icon: 'windows', text: 'Close the windows' },
    { icon: 'mask', text: 'Wear a well-fitted N95 or FFP2 mask outside' },
    { icon: 'purifier', text: 'Run an air purifier' },
  ],
  [
    { icon: 'exercise', text: 'Avoid all outdoor exercise' },
    { icon: 'windows', text: 'Keep windows and doors shut' },
    { icon: 'mask', text: 'Wear a well-fitted N95 or FFP2 mask outside' },
    { icon: 'purifier', text: 'Run an air purifier, on high' },
    { icon: 'indoors', text: 'Keep children and older people indoors' },
  ],
  [
    { icon: 'indoors', text: 'Stay indoors, and keep children and older people in' },
    { icon: 'windows', text: 'Keep windows and doors shut' },
    { icon: 'purifier', text: 'Run an air purifier, on high' },
    { icon: 'mask', text: 'If you must go out, wear a well-fitted N95 or FFP2 mask' },
  ],
];

const levelIndex = (aqi: number): number => {
  let index = 0;
  LEVELS.forEach((level, i) => {
    if (aqi >= level.from) index = i;
  });
  return index;
};

export const headlineFor = (aqi: number): string => HEADLINES[levelIndex(aqi)] ?? '';
export const adviceFor = (aqi: number): readonly Advice[] => ADVICE[levelIndex(aqi)] ?? [];
