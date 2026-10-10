import { scaleLinear } from 'd3-scale';
import { area, line } from 'd3-shape';
import type { DeviceHour } from '../sim';

const W = 320;
const H = 140;
const PAD = { top: 10, right: 8, bottom: 22, left: 28 };

/**
 * The day so far: the air outside (warm line) and the air in the room (blue line and wash), with the hours the
 * cleaner ran shaded green behind them. Drawn from the same numbers as the words beside it.
 */
export function DeviceChart({
  hours,
  label,
}: {
  readonly hours: readonly DeviceHour[];
  readonly label: string;
}): React.JSX.Element {
  const top = Math.max(35, ...hours.map((h) => Math.max(h.outdoor, h.indoor))) * 1.1;
  const x = scaleLinear()
    .domain([0, 23])
    .range([PAD.left, W - PAD.right]);
  const y = scaleLinear()
    .domain([0, top])
    .range([H - PAD.bottom, PAD.top]);
  const step = (x(1) - x(0)) / 2;
  const indoor = line<DeviceHour>()
    .x((h) => x(h.hour))
    .y((h) => y(h.indoor));
  const outdoor = line<DeviceHour>()
    .x((h) => x(h.hour))
    .y((h) => y(h.outdoor));
  const wash = area<DeviceHour>()
    .x((h) => x(h.hour))
    .y0(y(0))
    .y1((h) => y(h.indoor));
  const ticks = [0, 6, 12, 18];
  return (
    <svg
      className="dev-chart"
      viewBox={`0 0 ${String(W)} ${String(H)}`}
      role="img"
      aria-label={label}
    >
      {hours
        .filter((h) => h.fan)
        .map((h) => (
          <rect
            key={h.hour}
            x={x(h.hour) - step}
            y={PAD.top}
            width={step * 2}
            height={H - PAD.bottom - PAD.top}
            className="dev-fan"
          />
        ))}
      {[0, 0.5, 1].map((share) => (
        <g key={share}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(top * share)}
            y2={y(top * share)}
            className="dev-grid"
          />
          <text x={PAD.left - 4} y={y(top * share) + 3} className="dev-axis" textAnchor="end">
            {Math.round(top * share)}
          </text>
        </g>
      ))}
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={H - 6} className="dev-axis" textAnchor="middle">
          {String(t).padStart(2, '0')}
        </text>
      ))}
      <path d={wash(hours) ?? ''} className="dev-wash" />
      <path d={outdoor(hours) ?? ''} className="dev-out" />
      <path d={indoor(hours) ?? ''} className="dev-in" />
    </svg>
  );
}
