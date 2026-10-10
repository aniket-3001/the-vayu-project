import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CigaretteIcon } from './CigaretteIcon';
import {
  cigarettesPerDay,
  describeCigarettes,
  describeCigarettesShort,
  SMOKE_CAVEAT,
} from './smoke';

export const UNITS_STORAGE_KEY = 'vayu.units.v1';

interface AirUnits {
  /** Whether numbers are also shown as cigarettes a day. */
  readonly smoke: boolean;
  readonly toggle: () => void;
}

const Units = createContext<AirUnits>({ smoke: false, toggle: () => undefined });

export const useAirUnits = (): AirUnits => useContext(Units);

const load = (): boolean => {
  try {
    return window.localStorage.getItem(UNITS_STORAGE_KEY) === 'smoke';
  } catch {
    return false;
  }
};

/** Holds the person's choice of measure for the whole app, and remembers it on this device. */
export function AirUnitsProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [smoke, setSmoke] = useState(load);
  const toggle = useCallback(() => {
    setSmoke((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(UNITS_STORAGE_KEY, next ? 'smoke' : 'aqi');
      } catch {
        // Best effort.
      }
      return next;
    });
  }, []);
  const value = useMemo(() => ({ smoke, toggle }), [smoke, toggle]);
  return <Units.Provider value={value}>{children}</Units.Provider>;
}

/**
 * A cigarette beside the Ask button. Off, it is a plain outline. On, it lights up in white and orange with a
 * little smoke, and every screen also shows the air as cigarettes.
 */
export function SmokeToggle(): React.JSX.Element {
  const { smoke, toggle } = useAirUnits();
  return (
    <button
      type="button"
      className={`smoke-toggle${smoke ? ' on' : ''}`}
      aria-pressed={smoke}
      aria-label="Relatable measure: also show cigarettes a day"
      title="Relatable measure: also show cigarettes a day"
      onClick={toggle}
    >
      <CigaretteIcon size={26} lit={smoke} />
      {smoke && (
        <span className="smoke-puffs" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </button>
  );
}

/** "≈ 3 cigarettes a day" beside a number, when the relatable measure is on. Nothing when it is off. */
export function SmokeNote({
  pm25,
  className = '',
  short = false,
}: {
  readonly pm25: number;
  readonly className?: string;
  /** The shorter wording, for tight places such as a small card. */
  readonly short?: boolean;
}): React.JSX.Element | null {
  const { smoke } = useAirUnits();
  if (!smoke) return null;
  return (
    <span className={`smoke-note ${className}`.trim()}>
      <CigaretteIcon size={16} lit />
      <span>
        {short
          ? describeCigarettesShort(cigarettesPerDay(pm25))
          : describeCigarettes(cigarettesPerDay(pm25))}
      </span>
    </span>
  );
}

/**
 * A small square card beside the AQI: one cigarette, a number, and what it means. Quiet and still. `compact` is
 * just the cigarette and the number, for the corner of a place card.
 */
export function SmokeSquare({
  pm25,
  className = '',
  compact = false,
}: {
  readonly pm25: number;
  readonly className?: string;
  readonly compact?: boolean;
}): React.JSX.Element | null {
  const { smoke } = useAirUnits();
  if (!smoke) return null;
  const perDay = cigarettesPerDay(pm25);
  const shown = perDay < 0.5 ? '<½' : perDay >= 10 ? String(Math.round(perDay)) : String(perDay);
  const words = describeCigarettesShort(perDay);
  return (
    <span
      className={`smoke-square${compact ? ' compact' : ''} ${className}`.trim()}
      role="group"
      aria-label={`${words}. ${SMOKE_CAVEAT}`}
      title={SMOKE_CAVEAT}
    >
      <span className="smoke-square-top" aria-hidden="true">
        <CigaretteIcon size={compact ? 16 : 20} lit />
        <strong className="tnum">{shown}</strong>
      </span>
      {!compact && (
        <span className="smoke-square-label" aria-hidden="true">
          cigarettes a day
        </span>
      )}
    </span>
  );
}
