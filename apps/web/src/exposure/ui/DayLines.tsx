import { Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { levelForAqi } from '../../design/levels';
import { hourName } from '../../today/time';
import type { Cell, Where } from '../model';
import { SPOT_LABELS, type SpotKind } from '../spots';

export const WHERE_LABELS: Readonly<Record<Where, string>> = {
  ...SPOT_LABELS,
  live: 'Live outdoor location',
};

/** The three lines of a day: home, school or work, and live outdoor location. */
export const DIAL_RINGS = ['home', 'work', 'outdoor'] as const;
export type DialRing = (typeof DIAL_RINGS)[number];

/** The line an hour belongs to: school is the work line, and a fix from the phone is the place it was in. */
export function ringOf(cell: {
  readonly where: Where;
  readonly at?: SpotKind | undefined;
}): DialRing {
  const where = cell.where === 'live' ? (cell.at ?? 'outdoor') : cell.where;
  return where === 'school' ? 'work' : where;
}

/** One coloured piece of an hour on one line: the whole hour, or part of it when the hour was split. */
interface Piece {
  readonly hour: number;
  readonly ring: DialRing;
  readonly from: number;
  readonly to: number;
  readonly aqi: number;
}

/** The pieces the lines draw: a split hour is drawn on two lines, each only for its own minutes. */
export function piecesOf(cells: readonly Cell[]): readonly Piece[] {
  return cells.flatMap((cell): Piece[] =>
    cell.parts === undefined
      ? [{ hour: cell.hour, ring: ringOf(cell), from: 0, to: 1, aqi: cell.aqi }]
      : cell.parts.map((part) => ({
          hour: cell.hour,
          ring: ringOf(part),
          from: part.from,
          to: part.to,
          aqi: part.aqi,
        })),
  );
}

/** What each line is, in a few words, for the card that explains them. */
export const RING_HELP: Readonly<Record<DialRing, string>> = {
  home: 'The hours you were at home, which is where the rest of the day is assumed to be',
  work: 'The hours you were at school or work, from your timetable',
  outdoor: 'The hours your location, or a walk you logged, put you outside',
};

/**
 * The card that explains the lines, which pops up from a small “i” at the corner of the chart, the way an alert
 * opens. It says how to read the chart and what each line is.
 */
export function DialInfo({
  names,
}: {
  readonly names: Readonly<Record<DialRing, string>>;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="dial-info-button"
        aria-label="How to read this chart"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Info size={20} strokeWidth={2} aria-hidden="true" />
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
          <div
            className="sheet dial-info"
            role="dialog"
            aria-modal="true"
            aria-label="How to read this chart"
          >
            <div className="sheet-head">
              <h2>How to read this</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => {
                  setOpen(false);
                }}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <p>
              Each line is one kind of place and each block is one hour, from 12 am on the left to
              12 am on the right. At any hour you are in one place, so one line has a colour there,
              the colour of the air you breathed. A block coloured for part of its width is an hour
              that was part spent in two places.
            </p>
            <ol className="ring-key" aria-label="The lines, top to bottom">
              {DIAL_RINGS.map((ring) => (
                <li key={ring}>
                  <strong>{names[ring]}</strong>
                  <span className="muted small"> {RING_HELP[ring]}</span>
                </li>
              ))}
            </ol>
            <p className="muted small">
              Green is clean and red is unhealthy. A grey block means no place was set for that
              hour, or the hour has not happened yet.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The day as straight, labelled lines: a time axis along the top and one line for each kind of place, each hour a
 * block coloured by the AQI breathed there. The picked hour is outlined down all the lines, and a block can be
 * pressed to pick its hour. An hour part spent in two places is coloured for each part.
 */
export function DayLines({
  cells,
  names,
  nowHour,
  picked,
  onPick,
}: {
  /** One cell for each hour: the place the person was in, and nothing for the places they were not. */
  readonly cells: readonly Cell[];
  readonly names: Readonly<Record<DialRing, string>>;
  /** The hour in progress today, to mark, or undefined for a finished day. */
  readonly nowHour: number | undefined;
  readonly picked: number;
  readonly onPick: (hour: number) => void;
}): React.JSX.Element {
  const pieces = piecesOf(cells);
  const axis = [0, 3, 6, 9, 12, 15, 18, 21];
  const column = (hour: number): string => `${String(((hour + 0.5) / 24) * 100)}%`;
  return (
    <div
      className="daylines"
      role="img"
      aria-label="A 24-hour chart of the air you breathed: one line each for home, school or work, and live outdoor location"
    >
      <div className="dl-axis" aria-hidden="true">
        <span className="dl-name" />
        <div className="dl-ticks">
          {axis.map((h) => (
            <span key={h} style={{ left: column(h) }}>
              {hourName(h)}
            </span>
          ))}
        </div>
      </div>
      <div className="dl-rows">
        {DIAL_RINGS.map((ring) => (
          <div key={ring} className="dl-row">
            <span className="dl-name">{names[ring]}</span>
            <div className="dl-track">
              {Array.from({ length: 24 }, (_, hour) => {
                const here = pieces.filter((p) => p.hour === hour && p.ring === ring);
                return (
                  <span
                    key={hour}
                    className={`dl-cell${here.length === 0 ? ' blank' : ''}${hour === picked ? ' picked' : ''}`}
                    onClick={() => {
                      onPick(hour);
                    }}
                    aria-hidden="true"
                  >
                    {here.map((p, i) => (
                      <i
                        // A piece of an hour: its place in the hour is its identity.
                        key={`${String(hour)}-${String(i)}`}
                        style={{
                          left: `${String(p.from * 100)}%`,
                          width: `${String((p.to - p.from) * 100)}%`,
                          background: levelForAqi(p.aqi).solid,
                        }}
                      />
                    ))}
                  </span>
                );
              })}
              {/* The picked hour is outlined across every line, and now is marked. */}
              <span
                className="dl-picked"
                aria-hidden="true"
                style={{ left: `${String((picked / 24) * 100)}%` }}
              />
              {nowHour !== undefined && (
                <span
                  className="dl-now"
                  aria-hidden="true"
                  style={{ left: `${String((nowHour / 24) * 100)}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
