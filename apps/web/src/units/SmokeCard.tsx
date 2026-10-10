import { Cigarette as CigaretteIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  cigarettesPerDay,
  describeCigarettes,
  describeCigarettesShort,
  SMOKE_CAVEAT,
} from './smoke';
import { useAirUnits } from './AirUnits';

/** How many whole cigarettes to draw before saying "and more". */
const MAX_DRAWN = 10;

/** One cigarette standing up, lit at the top, with smoke rising from it. `fill` is how much of it is left, 0 to 1. */
function Cigarette({
  fill,
  index,
}: {
  readonly fill: number;
  readonly index: number;
}): React.JSX.Element {
  return (
    <span className="cig" style={{ ['--delay' as string]: `${String(index * 0.35)}s` }}>
      <span className="wisp w1" />
      <span className="wisp w2" />
      <span className="wisp w3" />
      <span className="cig-body" style={{ height: `${String(14 + fill * 46)}px` }}>
        <span className="cig-ember" />
        <span className="cig-paper" />
        <span className="cig-filter" />
      </span>
    </span>
  );
}

/**
 * The smoking equivalent as a card of its own: cigarettes drawn one by one, smoke curling up from each, and the
 * number said in words. Only there when the relatable measure is on; it is meant to be noticed.
 */
export function SmokeCard({
  pm25,
  title = 'In cigarettes',
  note,
}: {
  readonly pm25: number;
  readonly title?: string;
  readonly note?: string;
}): React.JSX.Element | null {
  const { smoke } = useAirUnits();
  if (!smoke) return null;
  const perDay = cigarettesPerDay(pm25);
  const whole = Math.floor(perDay);
  const drawn = Math.min(MAX_DRAWN, whole);
  const part = perDay - whole;
  const sticks = Array.from({ length: drawn }, (_, i) => ({ fill: 1, key: i }));
  if (part >= 0.1 && drawn < MAX_DRAWN) sticks.push({ fill: part, key: drawn });
  return (
    <section className="smoke-card" aria-labelledby="smoke-title">
      <div className="smoke-copy">
        <h2 id="smoke-title">{title}</h2>
        <p className="smoke-big">
          {perDay < 0.5
            ? 'Less than half a cigarette'
            : `About ${describeCigarettes(perDay).replace('about ', '').replace(' a day', '')}`}
          <span> a day</span>
        </p>
        {note !== undefined && <p className="small">{note}</p>}
        <p className="small smoke-caveat">{SMOKE_CAVEAT}</p>
      </div>
      <div className="cig-row" aria-hidden="true">
        {sticks.map(({ fill, key }) => (
          <Cigarette key={key} fill={fill} index={key} />
        ))}
        {whole > MAX_DRAWN && <span className="cig-more">+{whole - MAX_DRAWN}</span>}
      </div>
    </section>
  );
}

/**
 * A small card beside the AQI, quiet until pressed: "3 cigarettes a day". Pressing it opens the full picture,
 * with the cigarettes burning and the caveat. Nothing when the relatable measure is off.
 */
export function SmokeChip({
  pm25,
  title,
  note,
  className = '',
}: {
  readonly pm25: number;
  readonly title: string;
  readonly note?: string;
  readonly className?: string;
}): React.JSX.Element | null {
  const { smoke } = useAirUnits();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!smoke) return null;
  return (
    <>
      <button
        type="button"
        className={`smoke-chip ${className}`.trim()}
        aria-haspopup="dialog"
        aria-label={`${describeCigarettesShort(cigarettesPerDay(pm25))}. Tap for more`}
        onClick={() => {
          setOpen(true);
        }}
      >
        <CigaretteIcon size={16} strokeWidth={2} aria-hidden="true" />
        <span>{describeCigarettesShort(cigarettesPerDay(pm25))}</span>
      </button>
      {open && (
        <div
          className="sheet-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          <div className="sheet smoke-sheet" role="dialog" aria-modal="true" aria-label={title}>
            <button
              type="button"
              className="icon-button sheet-x"
              aria-label="Close"
              onClick={() => {
                setOpen(false);
              }}
            >
              <X size={20} aria-hidden="true" />
            </button>
            <SmokeCard pm25={pm25} title={title} {...(note === undefined ? {} : { note })} />
          </div>
        </div>
      )}
    </>
  );
}
