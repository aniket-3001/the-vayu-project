import type { CSSProperties } from 'react';
import type { Level } from '../../design/levels';

/** Gives an element its level's colours as CSS variables, so the stylesheet never repeats a hex. */
export const levelVars = (level: Level): CSSProperties =>
  ({ '--level': level.solid, '--on-level': level.onSolid }) as CSSProperties;

/** A concentration the way IQAir shows it: one decimal under 100, whole numbers above. */
export const concentration = (value: number): string =>
  value >= 100 ? String(Math.round(value)) : value.toFixed(1);

/** "PM2.5" → ["PM", "2.5"], "O3" → ["O", "3"], "CO" → ["CO", ""], for drawing subscripts. */
export function splitLabel(label: string): [string, string] {
  const match = /^([A-Za-z]+)([\d.]*)$/.exec(label);
  return [match?.[1] ?? label, match?.[2] ?? ''];
}
