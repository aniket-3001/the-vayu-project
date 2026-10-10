import { arc } from 'd3-shape';
import { UserRound } from 'lucide-react';
import { levelForAqi } from '../../design/levels';
import { RINGS, type Cell, type Where } from '../model';
import { SPOT_LABELS } from '../spots';

const SIZE = 372;
const C = SIZE / 2;
const OUTER = 148;
const INNER = 86;
const SWEEP = 290; // degrees, with the gap at the bottom where 24 meets 0

export const WHERE_LABELS: Readonly<Record<Where, string>> = { ...SPOT_LABELS, live: 'Live' };

/** Angle of the start of an hour, in radians from the top, clockwise. */
const angle = (hour: number): number => ((-SWEEP / 2 + (hour / 24) * SWEEP) * Math.PI) / 180;

const point = (radius: number, hour: number): [number, number] => [
  C + radius * Math.sin(angle(hour)),
  C - radius * Math.cos(angle(hour)),
];

const cellPath = arc();

/**
 * The day as a dial, in IQAir's shape: 24 hours round an arc, one ring per kind of place, each hour
 * coloured by the AQI breathed there. One kind selected becomes one thick ring.
 */
export function Dial({
  cells,
  show,
  nowHour,
  picked,
  onPick,
  set,
}: {
  readonly cells: readonly Cell[];
  /** `all` for every ring, or one kind for a single thick ring. */
  readonly show: 'all' | Where;
  /** The hour to mark as now, or undefined for a finished day. */
  readonly nowHour: number | undefined;
  readonly picked: number;
  readonly onPick: (hour: number) => void;
  /** Which kinds have been set, so the others show faint in the centre. */
  readonly set: ReadonlySet<Where>;
}): React.JSX.Element {
  const rings = show === 'all' ? RINGS : [show];
  const thickness = (OUTER - INNER) / rings.length;
  const gap = rings.length > 1 ? 2 : 0;

  return (
    <svg
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      className="dial"
      role="img"
      aria-label="A 24-hour dial of the air you breathed, one ring for each kind of place"
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
        return (
          <g key={where}>
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
      {RINGS.map((where, i) => (
        <text
          key={where}
          x={C}
          y={C - 4 + i * 11}
          textAnchor="middle"
          className={`dial-name${show === where ? ' on' : ''}${set.has(where) ? '' : ' unset'}`}
        >
          {WHERE_LABELS[where].toUpperCase()}
        </text>
      ))}
    </svg>
  );
}
