import type { CSSProperties } from 'react';
import { AirParticles, type ParticleKind, type Rgb } from '../../components/AirParticles';
import { GRAP_COLOURS, levelForAqi } from '../../design/levels';
import type { Alert } from '../model';

const toRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** What an alert looks like: the moving picture, its colour, and the class and variables that dress its card. */
export interface SceneTheme {
  readonly particles: ParticleKind;
  readonly tint: Rgb;
  readonly stage: number;
  readonly className: string;
  readonly style: CSSProperties;
}

/**
 * A scene for each alert, one theme for the sheet and the row alike so the two always match:
 * - a GRAP stage and a smog day wear the colour of the AQI scale for their air, with its specks or haze;
 * - rain is a sky-blue card under dark clouds, with drops falling and beading on the text;
 * - burning is a dark card with a low flame, sparks and rising smoke;
 * - wind is a pale, airy card with streaks and leaves.
 */
export function sceneFor(alert: Alert): SceneTheme {
  switch (alert.kind) {
    case 'rain':
      return {
        particles: 'rain',
        tint: [90, 120, 160],
        stage: 1,
        className: 'scene-rain',
        style: {},
      };
    case 'stubble':
      return {
        particles: 'sparks',
        tint: [255, 140, 60],
        stage: 1,
        className: 'scene-stubble',
        style: {},
      };
    case 'wind':
      return {
        particles: 'wind',
        tint: [160, 200, 200],
        stage: 1,
        className: 'scene-wind',
        style: {},
      };
    case 'grap': {
      const stage = alert.stage ?? 1;
      const colours = GRAP_COLOURS[stage];
      const rgb = toRgb(colours.solid);
      return {
        particles: 'grap',
        tint: rgb,
        stage,
        className: 'scene-air',
        style: sceneVars(colours.solid, colours.soft, rgb, colours.onSolid),
      };
    }
    case 'smog': {
      const level = levelForAqi(alert.aqi ?? 160);
      const rgb = toRgb(level.solid);
      // Smog is the level's colour gone brown with dust.
      const hazy: Rgb = [
        Math.round((rgb[0] + 150) / 2),
        Math.round((rgb[1] + 120) / 2),
        Math.round((rgb[2] + 96) / 2),
      ];
      return {
        particles: 'smog',
        tint: hazy,
        stage: 1,
        className: 'scene-air',
        style: sceneVars(level.solid, level.soft, rgb, level.onSolid),
      };
    }
  }
}

function sceneVars(solid: string, soft: string, rgb: Rgb, ink: string): CSSProperties {
  const triple = `${String(rgb[0])} ${String(rgb[1])} ${String(rgb[2])}`;
  return {
    '--scene-solid': solid,
    '--scene-soft': soft,
    '--scene-ink': ink,
    '--edge': solid,
    '--glow': triple,
  } as CSSProperties;
}

/** The moving picture for an alert, filling the card it is placed in. */
export function SceneBackdrop({
  alert,
  compact = false,
}: {
  readonly alert: Alert;
  readonly compact?: boolean;
}): React.JSX.Element {
  const theme = sceneFor(alert);
  return (
    <AirParticles kind={theme.particles} stage={theme.stage} tint={theme.tint} compact={compact} />
  );
}

/**
 * The text of an alert on a translucent card, so the scene behind shows through and the words are still easy to read.
 * In rain the card is misted: drops condense on it and slide down.
 */
export function SceneVeil({
  alert,
  compact = false,
  as: Tag = 'div',
  className = '',
  children,
}: {
  readonly alert: Alert;
  readonly compact?: boolean;
  readonly as?: 'div' | 'span';
  readonly className?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Tag className={`scene-veil ${className}`.trim()}>
      {alert.kind === 'rain' && <AirParticles kind="drip" compact={compact} />}
      {children}
    </Tag>
  );
}
