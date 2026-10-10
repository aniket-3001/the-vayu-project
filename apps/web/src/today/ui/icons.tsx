import {
  AirVent,
  AppWindow,
  ArrowUp,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSun,
  DoorClosed,
  Dumbbell,
  Footprints,
  Haze,
  House,
  Moon,
  Sun,
  Tornado,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { Face } from '../../design/levels';
import type { AdviceIcon } from '../advice';
import { arrowRotation, windFrom } from '../wind';
import type { Condition } from '../types';

export const CONDITION_LABELS: Readonly<Record<Condition, string>> = {
  clear: 'Clear',
  'partly-cloudy': 'Partly cloudy',
  cloudy: 'Cloudy',
  haze: 'Haze',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  thunderstorm: 'Thunderstorm',
  windy: 'Windy',
  dust: 'Dust',
};

const icon = (condition: Condition, isDay: boolean): LucideIcon => {
  switch (condition) {
    case 'clear':
      return isDay ? Sun : Moon;
    case 'partly-cloudy':
      return isDay ? CloudSun : CloudMoon;
    case 'cloudy':
      return Cloud;
    case 'haze':
      return Haze;
    case 'fog':
      return CloudFog;
    case 'drizzle':
      return CloudDrizzle;
    case 'rain':
      return CloudRain;
    case 'thunderstorm':
      return CloudLightning;
    case 'windy':
      return Wind;
    case 'dust':
      return Tornado;
  }
};

/** The sky as an icon, with the words for it as its name. A moon at night, a sun by day. */
export function WeatherIcon({
  condition,
  isDay,
  size = 24,
}: {
  readonly condition: Condition;
  readonly isDay: boolean;
  readonly size?: number;
}): React.JSX.Element {
  const Icon = icon(condition, isDay);
  const label = `${CONDITION_LABELS[condition]}${isDay ? '' : ', night'}`;
  return (
    <Icon
      className={`wx wx-${condition}${isDay ? '' : ' wx-night'}`}
      size={size}
      strokeWidth={1.75}
      role="img"
      aria-label={label}
    />
  );
}

/** An arrow pointing where the wind is going, named by where it comes from. */
export function WindArrow({
  fromDeg,
  size = 16,
}: {
  readonly fromDeg: number;
  readonly size?: number;
}): React.JSX.Element {
  return (
    <ArrowUp
      className="wind-arrow"
      size={size}
      strokeWidth={2.25}
      style={{ transform: `rotate(${String(arrowRotation(fromDeg))}deg)` }}
      role="img"
      aria-label={`Wind ${windFrom(fromDeg)}`}
    />
  );
}

/** A surgical mask, which Lucide does not have. Drawn to match its 24-point, 1.75-stroke style. */
export function MaskIcon({ size = 24 }: { readonly size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 7h12a2 2 0 0 1 2 2v3.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9a2 2 0 0 1 2-2Z" />
      <path d="M4 10H2M20 10h2M8 11.5h8M8 14h8" />
    </svg>
  );
}

const ADVICE_ICONS: Readonly<Record<Exclude<AdviceIcon, 'mask'>, LucideIcon>> = {
  walk: Footprints,
  'open-windows': AppWindow,
  exercise: Dumbbell,
  windows: DoorClosed,
  purifier: AirVent,
  indoors: House,
};

export function AdviceGlyph({
  name,
  size = 26,
}: {
  readonly name: AdviceIcon;
  readonly size?: number;
}): React.JSX.Element {
  if (name === 'mask') return <MaskIcon size={size} />;
  const Icon = ADVICE_ICONS[name];
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />;
}

const BROWS: Readonly<Partial<Record<Face, string>>> = {
  concerned: 'M17 19.5l8-1.5M47 19.5l-8-1.5',
  'masked-worried': 'M16 21l11-4M48 21l-11-4',
  'masked-alarm': 'M15 22.5l12-7M49 22.5l-12-7',
};

const MOUTHS: Readonly<Partial<Record<Face, string>>> = {
  happy: 'M21 38c3 6 19 6 22 0',
  neutral: 'M24 41h16',
  concerned: 'M23 44c3-5 15-5 18 0',
};

/** The status face. Drawn in one stroke colour so it takes the card's ink. */
export function FaceIcon({
  face,
  size = 72,
}: {
  readonly face: Face;
  readonly size?: number;
}): React.JSX.Element {
  const masked = face.startsWith('masked');
  const wide = face === 'masked-alarm';
  const brows = BROWS[face];
  const mouth = MOUTHS[face];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="face"
    >
      <circle cx="32" cy="32" r="28" />
      {brows !== undefined && <path d={brows} strokeWidth="2.75" />}
      <circle cx="23" cy="27" r={wide ? 3.4 : 2.6} fill="currentColor" stroke="none" />
      <circle cx="41" cy="27" r={wide ? 3.4 : 2.6} fill="currentColor" stroke="none" />
      {mouth !== undefined && <path d={mouth} />}
      {masked && (
        <>
          <path
            d="M16 35.5h32a2 2 0 0 1 2 2V41a9 9 0 0 1-9 9H23a9 9 0 0 1-9-9v-3.5a2 2 0 0 1 2-2Z"
            fill="currentColor"
            fillOpacity="0.16"
            strokeWidth="2.5"
          />
          <path d="M14 38.5H7M50 38.5h7M21 41h22M21 45h22" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}
