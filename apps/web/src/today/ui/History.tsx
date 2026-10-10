import { scaleLinear } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';
import { LEVELS, levelForAqi } from '../../design/levels';
import { clock24 } from '../time';
import type { TodayData } from '../types';
import { levelVars } from './format';
import { useWidth } from './hooks';

const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 40 } as const;

/** The last 48 hours of AQI over the six level bands, so you can see which band it sat in. */
export function History({ data }: { readonly data: TodayData }): React.JSX.Element | null {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const points = data.history;
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) return null;

  const peak = Math.max(...points.map((p) => p.aqi));
  const low = Math.min(...points.map((p) => p.aqi));
  const top = Math.max(100, Math.ceil((peak * 1.15) / 50) * 50);
  const x = scaleLinear()
    .domain([Date.parse(first.at), Date.parse(last.at)])
    .range([PAD.left, width - PAD.right]);
  const y = scaleLinear()
    .domain([0, top])
    .range([HEIGHT - PAD.bottom, PAD.top]);
  const path = line<(typeof points)[number]>()
    .x((p) => x(Date.parse(p.at)))
    .y((p) => y(p.aqi))
    .curve(curveMonotoneX)(points);
  const fill = area<(typeof points)[number]>()
    .x((p) => x(Date.parse(p.at)))
    .y0(y(0))
    .y1((p) => y(p.aqi))
    .curve(curveMonotoneX)(points);
  const ticks = points.filter((_, i) => i % 12 === 11 || i === 0);
  const nowLevel = levelForAqi(last.aqi);

  return (
    <section className="card" aria-labelledby="history-title">
      <div className="card-head">
        <h2 id="history-title">Last 48 hours</h2>
        <span className="muted small">US AQI</span>
      </div>
      <div ref={ref} className="chart">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`US AQI over the last 48 hours: low ${String(low)}, high ${String(peak)}, now ${String(last.aqi)}`}
        >
          {LEVELS.map((level, i) => {
            const from = level.from;
            const to = LEVELS[i + 1]?.from ?? top;
            if (from >= top) return null;
            return (
              <g key={level.name}>
                <rect
                  x={PAD.left}
                  width={width - PAD.left - PAD.right}
                  y={y(Math.min(to, top))}
                  height={y(from) - y(Math.min(to, top))}
                  style={{ fill: level.solid }}
                  className="band"
                />
                {from > 0 && y(LEVELS[i - 1]?.from ?? 0) - y(from) >= 14 && (
                  <text x={PAD.left - 8} y={y(from) + 4} textAnchor="end" className="axis">
                    {from}
                  </text>
                )}
              </g>
            );
          })}
          <text x={PAD.left - 8} y={y(0) + 4} textAnchor="end" className="axis">
            0
          </text>
          {fill !== null && <path d={fill} className="area" />}
          {path !== null && <path d={path} className="trace" />}
          <circle
            cx={x(Date.parse(last.at))}
            cy={y(last.aqi)}
            r={6}
            className="now-dot"
            style={levelVars(nowLevel)}
          />
          {ticks.map((p, i) => (
            <text
              key={p.at}
              x={x(Date.parse(p.at))}
              y={HEIGHT - 8}
              textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
              className="axis"
            >
              {clock24(p.at)}
            </text>
          ))}
        </svg>
      </div>
    </section>
  );
}
