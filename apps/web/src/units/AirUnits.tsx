import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CigaretteIcon } from './CigaretteIcon';
import { cigaretteFigure, cigarettesPerDay, describeCigarettesShort, SMOKE_CAVEAT } from './smoke';

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
 * The air as cigarettes a day, only while the cigarette switch is on. It always sits right beside the AQI and in
 * the same size, with the cigarette beside its number:
 * - `figure` is a number with a small label under it, as the AQI is on a place card;
 * - `badge` is a tile like the AQI tile on the Today screen;
 * - `chip` is a small chip like the AQI chip in a line of text.
 */
export function SmokeFigure({
  pm25,
  variant = 'figure',
  className = '',
}: {
  readonly pm25: number;
  readonly variant?: 'figure' | 'badge' | 'chip';
  readonly className?: string;
}): React.JSX.Element | null {
  const { smoke } = useAirUnits();
  if (!smoke) return null;
  const perDay = cigarettesPerDay(pm25);
  const shown = cigaretteFigure(perDay);
  const words = describeCigarettesShort(perDay);
  const group = {
    role: 'group',
    'aria-label': `${words}. ${SMOKE_CAVEAT}`,
    title: SMOKE_CAVEAT,
  } as const;
  if (variant === 'chip')
    return (
      <span className={`chip cig-chip ${className}`.trim()} {...group}>
        <span className="cig-chip-in" aria-hidden="true">
          <CigaretteIcon size={16} lit />
          {shown}
        </span>
      </span>
    );
  const body = (
    <>
      <span className={variant === 'badge' ? 'badge-num' : 'smoke-fig-num'} aria-hidden="true">
        <CigaretteIcon size={30} lit />
        <span className="tnum">{shown}</span>
      </span>
      <span className={variant === 'badge' ? 'badge-unit' : 'smoke-fig-label'} aria-hidden="true">
        cigarettes a day
      </span>
    </>
  );
  return variant === 'badge' ? (
    <span className={`badge smoke-badge ${className}`.trim()} {...group}>
      {body}
    </span>
  ) : (
    <span className={`smoke-fig ${className}`.trim()} {...group}>
      {body}
    </span>
  );
}

/**
 * The AQI as a big number with its label and, while the cigarette switch is on, the cigarettes joined to it as a
 * second tile of the same size. Where there is room across (a wide card) the tiles sit side by side; where there
 * is room down (a narrow one) the AQI is on top and the cigarettes share its bottom edge.
 */
export function AirFigures({
  aqi,
  pm25,
  layout = 'row',
}: {
  readonly aqi: number;
  readonly pm25: number;
  readonly layout?: 'row' | 'stack';
}): React.JSX.Element {
  const { smoke } = useAirUnits();
  return (
    <span className={`pc-aqi${smoke ? ` pair ${layout}` : ''}`}>
      <span className="fig">
        <strong className="tnum">{aqi}</strong>
        <span>AQI</span>
      </span>
      <SmokeFigure pm25={pm25} />
    </span>
  );
}

/** An AQI chip and, with the cigarette switch on, the cigarette chip joined under it: for lines of text. */
export function ChipPair({
  children,
  pm25,
}: {
  /** The AQI chip. */
  readonly children: React.ReactNode;
  readonly pm25: number;
}): React.JSX.Element {
  const { smoke } = useAirUnits();
  return (
    <span className={`chip-pair${smoke ? ' on' : ''}`}>
      {children}
      <SmokeFigure pm25={pm25} variant="chip" />
    </span>
  );
}
