import { toMs } from '@vayu/core';

interface Line {
  readonly name: string;
  readonly colour: string;
  readonly dashed?: boolean;
  readonly points: readonly { readonly ts: string; readonly value: number }[];
}

const WIDTH = 600;
const HEIGHT = 200;
const PAD = 8;

/** Outside and the two rooms through the day, up to the clock. Each line is named; none is unlabelled. */
export function WorldChart({
  lines,
  dayStart,
  dayEnd,
}: {
  readonly lines: readonly Line[];
  readonly dayStart: string;
  readonly dayEnd: string;
}): React.JSX.Element {
  const values = lines.flatMap((line) => line.points.map((p) => p.value));
  const maxV = Math.max(10, ...values);
  const t0 = toMs(dayStart);
  const t1 = toMs(dayEnd);
  const xOf = (ts: string): number => PAD + ((toMs(ts) - t0) / (t1 - t0)) * (WIDTH - 2 * PAD);
  const yOf = (value: number): number => HEIGHT - PAD - (value / maxV) * (HEIGHT - 2 * PAD);
  const path = (points: Line['points']): string =>
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.ts).toFixed(1)},${yOf(p.value).toFixed(1)}`)
      .join(' ');

  return (
    <figure
      className="chart"
      role="img"
      aria-label={`PM2.5 through the day. ${lines.map((l) => `${l.name}: ${String(l.points.length)} points`).join(', ')}`}
    >
      <svg
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        className="chart__svg"
        aria-hidden="true"
      >
        {lines.map((line) =>
          line.points.length === 0 ? null : (
            <path
              key={line.name}
              d={path(line.points)}
              fill="none"
              stroke={line.colour}
              strokeWidth={2}
              strokeDasharray={line.dashed === true ? '4 3' : undefined}
            />
          ),
        )}
      </svg>
      <ul className="chart__legend">
        {lines.map((line) => (
          <li key={line.name} className="chart__legend-item">
            <span
              className="chart__swatch"
              style={{ background: line.colour }}
              aria-hidden="true"
            />
            {line.name}
          </li>
        ))}
      </ul>
    </figure>
  );
}
