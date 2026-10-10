import { Cigarette } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cigarettesPerDay, describeCigarettes } from './smoke';

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

/** The icon in the top bar that switches every screen to a more relatable measure. */
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
      <Cigarette size={20} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

/** "≈ 3 cigarettes a day" beside a number, when the relatable measure is on. Nothing when it is off. */
export function SmokeNote({
  pm25,
  className = '',
}: {
  readonly pm25: number;
  readonly className?: string;
}): React.JSX.Element | null {
  const { smoke } = useAirUnits();
  if (!smoke) return null;
  return (
    <span className={`smoke-note ${className}`.trim()}>
      <Cigarette size={14} strokeWidth={2} aria-hidden="true" />
      <span>{describeCigarettes(cigarettesPerDay(pm25))}</span>
    </span>
  );
}
