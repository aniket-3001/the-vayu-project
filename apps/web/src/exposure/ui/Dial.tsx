import { arc } from 'd3-shape';
import { Info, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { levelForAqi } from '../../design/levels';
import type { Cell, Where } from '../model';
import { SPOT_LABELS } from '../spots';

const SIZE = 372;
const C = SIZE / 2;
const OUTER = 148;
const INNER = 86;
const SWEEP = 290; // degrees, with the gap at the bottom where 24 meets 0

export const WHERE_LABELS: Readonly<Record<Where, string>> = {
  ...SPOT_LABELS,
  live: 'Live outdoor location',
};

/** The three rings of a day, outside in: home, work or school, and outdoors. */
export const DIAL_RINGS = ['home', 'work', 'outdoor'] as const;
export type DialRing = (typeof DIAL_RINGS)[number];

/** The ring an hour belongs to: school is the work ring, and a fix from the phone is the place it was in. */
export function ringOf(cell: Cell): DialRing {
  const where = cell.where === 'live' ? (cell.at ?? 'outdoor') : cell.where;
  return where === 'school' ? 'work' : where;
}

/** What each ring is, in a few words, for the card that explains the dial. */
export const RING_HELP: Readonly<Record<DialRing, string>> = {
  home: 'The hours you were at home, which is where the rest of the day is assumed to be',
  work: 'The hours you were at school or work, from your timetable',
  outdoor: 'The hours your location, or a walk you logged, put you outside',
};

/**
 * The card that explains the dial, which pops up from a small “i” at the corner of the chart, the way an alert
 * opens. It says how to read the chart and what each ring is, and nothing else is in the way of the chart.
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
              Each segment is one hour, from 0 at the bottom left round to 24. At any hour you are
              in one place, so one ring is filled for it, in the colour of the air you breathed
              there.
            </p>
            <ol className="ring-key" aria-label="The rings, outside in">
              {DIAL_RINGS.map((ring) => (
                <li key={ring}>
                  <strong>{names[ring]}</strong>
                  <span className="muted small"> {RING_HELP[ring]}</span>
                </li>
              ))}
            </ol>
            <p className="muted small">
              Green is clean and red is unhealthy. A grey segment means no place was set for that
              hour, or the hour has not happened yet.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/** Angle of the start of an hour, in radians from the top, clockwise. */
const angle = (hour: number): number => ((-SWEEP / 2 + (hour / 24) * SWEEP) * Math.PI) / 180;

const point = (radius: number, hour: number): [number, number] => [
  C + radius * Math.sin(angle(hour)),
  C - radius * Math.cos(angle(hour)),
];

const cellPath = arc();

/**
 * The day as a dial, in IQAir's shape: 24 hours round an arc, one ring per kind of place, each hour
 * coloured by the AQI breathed there. Every ring is always drawn and named at its start; choosing a kind lifts that
 * ring (an outline, the others faded) and leaves the picture where it is.
 */
export function Dial({
  cells,
  names,
  focus,
  nowHour,
  picked,
  onPick,
}: {
  /** One cell for each hour: the place the person was in, and nothing for the places they were not. */
  readonly cells: readonly Cell[];
  readonly names: Readonly<Record<DialRing, string>>;
  /** The ring the person is looking at: it is outlined and the others fade. Undefined shows all alike. */
  readonly focus?: DialRing | undefined;
  /** The hour to mark as now, or undefined for a finished day. */
  readonly nowHour: number | undefined;
  readonly picked: number;
  readonly onPick: (hour: number) => void;
}): React.JSX.Element {
  const rings = DIAL_RINGS;
  const thickness = (OUTER - INNER) / rings.length;
  const gap = 2;

  return (
    <svg
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      className="dial"
      role="img"
      aria-label="A 24-hour dial of the air you breathed: home, work or school, and outdoors"
    >
      {Array.from({ length: 25 }, (_, h) => {
        const [x1, y1] = point(OUTER + 4, h);
        const [x2, y2] = point(OUTER + (h % 3 === 0 ? 10 : 7), h);
        return (
          <line
            key={h}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className={h % 3 === 0 ? 'dial-tick strong' : 'dial-tick'}
          />
        );
      })}
      {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => {
        const [x, y] = point(OUTER + 22, h);
        return (
          <text
            key={h}
            x={x}
            y={y + 4}
            textAnchor="middle"
            className={h % 6 === 0 ? 'dial-label strong' : 'dial-label'}
          >
            {h}
          </text>
        );
      })}
      {rings.map((where, ringIndex) => {
        const outer = OUTER - ringIndex * thickness;
        const inner = outer - thickness + gap;
        const lifted = focus === where;
        const faded = focus !== undefined && !lifted;
        // Each ring is named in the gap at the bottom, where the day starts and ends, bent round its own ring.
        const mid = (outer + inner) / 2;
        const [x0, y0] = point(mid + 3, 0); // the start of the day, bottom left
        const [x1, y1] = point(mid + 3, 24); // the end of the day, bottom right
        const pathId = `ring-name-${where}`;
        return (
          <g key={where} className={faded ? 'ring faded' : lifted ? 'ring lifted' : 'ring'}>
            {/* The name runs along the ring through the gap, from the left of the bottom to the right. */}
            <path
              id={pathId}
              d={`M ${String(x0)} ${String(y0)} A ${String(mid + 3)} ${String(mid + 3)} 0 0 0 ${String(x1)} ${String(y1)}`}
              fill="none"
            />
            <text className={`ring-name${lifted ? ' on' : ''}`} aria-hidden="true">
              <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
                {names[where]}
              </textPath>
            </text>
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = cells.find((c) => c.hour === hour && ringOf(c) === where);
              const d = cellPath({
                innerRadius: inner,
                outerRadius: outer,
                startAngle: angle(hour) + 0.004,
                endAngle: angle(hour + 1) - 0.004,
              });
              return (
                <path
                  key={hour}
                  d={d ?? ''}
                  transform={`translate(${String(C)} ${String(C)})`}
                  className={cell === undefined ? 'cell empty' : 'cell'}
                  style={cell === undefined ? undefined : { fill: levelForAqi(cell.aqi).solid }}
                  onClick={() => {
                    onPick(hour);
                  }}
                  aria-hidden="true"
                />
              );
            })}
            {lifted && (
              <path
                d={
                  cellPath({
                    innerRadius: inner - 1,
                    outerRadius: outer + 1,
                    startAngle: angle(0),
                    endAngle: angle(24),
                  }) ?? ''
                }
                transform={`translate(${String(C)} ${String(C)})`}
                className="ring-outline"
              />
            )}
          </g>
        );
      })}
      <path
        d={
          cellPath({
            innerRadius: INNER - 2,
            outerRadius: OUTER + 2,
            startAngle: angle(picked),
            endAngle: angle(picked + 1),
          }) ?? ''
        }
        transform={`translate(${String(C)} ${String(C)})`}
        className="picked"
      />
      {nowHour !== undefined &&
        (() => {
          const [x, y] = point(INNER - 8, nowHour);
          const rotation = (angle(nowHour) * 180) / Math.PI;
          return (
            <path
              d="M0 -7 L6 5 L-6 5 Z"
              transform={`translate(${String(x)} ${String(y)}) rotate(${String(rotation)})`}
              className="now-mark"
            />
          );
        })()}
      <circle cx={C} cy={C} r={INNER - 18} className="dial-centre" />
      <UserRound
        x={C - 18}
        y={C - 52}
        size={36}
        strokeWidth={1.5}
        className="dial-person"
        aria-hidden="true"
      />
    </svg>
  );
}
