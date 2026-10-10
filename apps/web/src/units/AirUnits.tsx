import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CigaretteIcon } from './CigaretteIcon';
import { cigarettesPerDay, describeCigarettesShort, SMOKE_CAVEAT } from './smoke';

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

/**
 * The air as cigarettes a day, as one square: a cigarette, the number, and what it counts. The same square
 * everywhere the measure is shown, in two sizes (`compact` for a corner of a card or a line of a list), and only
 * while the cigarette switch is on.
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
        <CigaretteIcon size={compact ? 20 : 26} lit />
        <strong className="tnum">{shown}</strong>
      </span>
      <span className="smoke-square-label" aria-hidden="true">
        {compact ? 'a day' : 'cigarettes a day'}
      </span>
    </span>
  );
}
