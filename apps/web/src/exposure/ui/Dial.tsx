import { arc } from 'd3-shape';
import { UserRound } from 'lucide-react';
import { levelForAqi } from '../../design/levels';
import type { Cell, Where } from '../model';
import { SPOT_LABELS } from '../spots';

const SIZE = 372;
const C = SIZE / 2;
const OUTER = 148;
const INNER = 86;
const SWEEP = 290; // degrees, with the gap at the bottom where 24 meets 0

export const WHERE_LABELS: Readonly<Record<Where, string>> = { ...SPOT_LABELS, live: 'Live' };

/** What each ring is, in a few words, for the key under the dial. */
export const WHERE_HELP: Readonly<Record<Where, string>> = {
  home: 'Hours at home, indoors unless a monitor says otherwise',
  work: 'Hours at work',
  school: 'Hours at school',
  outdoor: 'Time logged outside: walks, play, a park',
  live: 'Where your phone put you, hour by hour',
};

/**
 * What the dial shows, said plainly, with a key to its rings. The rings run from the outside in, in the order listed;
 * the chosen one is bold.
 */
export function DialKey({
  rings,
  focus,
}: {
  readonly rings: readonly Where[];
  readonly focus: 'all' | Where;
}): React.JSX.Element {
  return (
    <div className="dial-key">
      <p className="small">
        <strong>How to read this.</strong> Each segment is one hour, from 0 at the bottom left round
        to 24. Each ring is one kind of place, from the outside in. The colour is the AQI breathed
        there: green is clean, red is unhealthy. A grey segment means no place or no reading for
        that hour.
      </p>
      <ol className="ring-key" aria-label="The rings, outside in">
        {rings.map((where) => (
          <li key={where} className={focus === where ? 'on' : ''}>
            <strong>{WHERE_LABELS[where]}</strong>
            <span className="muted small"> {WHERE_HELP[where]}</span>
          </li>
        ))}
      </ol>
    </div>
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
  rings,
  focus,
  nowHour,
  picked,
  onPick,
  set,
}: {
  readonly cells: readonly Cell[];
  /** Every ring, outside in. */
  readonly rings: readonly Where[];
  /** `all` for every ring alike, or one kind to lift above the rest. */
  readonly focus: 'all' | Where;
  /** The hour to mark as now, or undefined for a finished day. */
  readonly nowHour: number | undefined;
  readonly picked: number;
  readonly onPick: (hour: number) => void;
  /** Which kinds have been set, so the others show faint in the centre. */
  readonly set: ReadonlySet<Where>;
}): React.JSX.Element {
  const thickness = (OUTER - INNER) / rings.length;
  const gap = rings.length > 1 ? 2 : 0;

  return (
    <svg
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      className="dial"
      role="img"
      aria-label="A 24-hour dial of the air you breathed, one ring for each kind of place: home, work or school, outdoors, and where your location put you"
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
        const faded = focus !== 'all' && !lifted;
        const [labelX, labelY] = point((outer + inner) / 2, 0);
        return (
          <g key={where} className={faded ? 'ring faded' : lifted ? 'ring lifted' : 'ring'}>
            <text
              x={labelX - 7}
              y={labelY + 3}
              textAnchor="end"
              className={`ring-name${lifted ? ' on' : ''}`}
            >
              {WHERE_LABELS[where]}
            </text>
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = cells.find((c) => c.hour === hour && c.where === where);
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
      {rings.map((where, i) => (
        <text
          key={where}
          x={C}
          y={C - 2 + i * 12}
          textAnchor="middle"
          className={`dial-name${focus === where ? ' on' : ''}${set.has(where) ? '' : ' unset'}`}
        >
          {WHERE_LABELS[where].toUpperCase()}
        </text>
      ))}
    </svg>
  );
}
