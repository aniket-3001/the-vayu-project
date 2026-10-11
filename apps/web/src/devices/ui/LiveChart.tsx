import { usAqi } from '@vayu/core';
import { scaleLinear } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';
import { useId } from 'react';
import { LEVELS, levelForAqi } from '../../design/levels';
import { useWidth } from '../../today/ui/hooks';
import { levelVars } from '../../today/ui/format';

export interface LivePoint {
  readonly atMs: number;
  readonly pm25: number;
}

const PAD = { top: 12, right: 14, bottom: 26, left: 40 } as const;
/** The window shows at least this much time, so the first few readings are not stretched across it. */
const MIN_SPAN_MS = 2 * 60_000;
const MAX_SPAN_MS = 10 * 60_000;

const aqiOf = (pm25: number): number => usAqi(pm25)?.value ?? 0;

/**
 * The room's air as it comes in: AQI over the standard six level bands, the area under the line washed in the level
 * colours, and a dot for now. The same drawing as "Last 48 hours", on a white card, but live: it moves with each
 * reading the unit sends.
 */
export function LiveChart({
  points,
  height = 190,
}: {
  readonly points: readonly LivePoint[];
  readonly height?: number;
}): React.JSX.Element | null {
  const [ref, width] = useWidth<HTMLDivElement>(320);
  const gradientId = useId();
  const last = points.at(-1);
  if (last === undefined || points.length < 2) return null;

  const first = points[0]?.atMs ?? last.atMs;
  const span = Math.min(MAX_SPAN_MS, Math.max(MIN_SPAN_MS, last.atMs - first));
  const from = last.atMs - span;
  const shown = points.filter((p) => p.atMs >= from).map((p) => ({ ...p, aqi: aqiOf(p.pm25) }));
  const peak = Math.max(...shown.map((p) => p.aqi));
  const low = Math.min(...shown.map((p) => p.aqi));
  const now = shown.at(-1)?.aqi ?? 0;
  const top = Math.max(100, Math.ceil((peak * 1.2) / 50) * 50);
  const x = scaleLinear()
    .domain([from, last.atMs])
    .range([PAD.left, width - PAD.right]);
  const y = scaleLinear()
    .domain([0, top])
    .range([height - PAD.bottom, PAD.top]);
  const path = line<(typeof shown)[number]>()
    .x((p) => x(p.atMs))
    .y((p) => y(p.aqi))
    .curve(curveMonotoneX)(shown);
  const fill = area<(typeof shown)[number]>()
    .x((p) => x(p.atMs))
    .y0(y(0))
    .y1((p) => y(p.aqi))
    .curve(curveMonotoneX)(shown);
  // A tick each minute (each two, for a long window), counted back from now.
  const step = span <= 5 * 60_000 ? 60_000 : 120_000;
  const ticks: { readonly at: number; readonly label: string }[] = [];
  for (let k = 0; last.atMs - k * step >= from; k++)
    ticks.push({
      at: last.atMs - k * step,
      label: k === 0 ? 'now' : `${String((k * step) / 60_000)} min ago`,
    });
  const bands = LEVELS.filter((level) => level.from < top);

  return (
    <div className="chart-live">
      <div className="chart-live-head">
        <span className="chart-live-pill">
          <span className="chart-live-dot" aria-hidden="true" /> Live
        </span>
        <span className="muted small">
          AQI in the room, last {String(Math.round(span / 60_000))} min
        </span>
      </div>
      <div ref={ref} className="chart">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`AQI in the room over the last ${String(Math.round(span / 60_000))} minutes: low ${String(low)}, high ${String(peak)}, now ${String(now)}`}
        >
          <defs>
            {/* The wash under the line takes the colour of the level each height falls in. */}
            <linearGradient
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              x1="0"
              x2="0"
              y1={y(0)}
              y2={y(top)}
            >
              {bands.flatMap((level, i) => {
                const lo = level.from / top;
                const hi = Math.min(1, (bands[i + 1]?.from ?? top) / top);
                return [
                  <stop key={`${level.name}-a`} offset={lo} stopColor={level.solid} />,
                  <stop key={`${level.name}-b`} offset={hi} stopColor={level.solid} />,
                ];
              })}
            </linearGradient>
          </defs>
          {bands.map((level, i) => {
            const to = Math.min(bands[i + 1]?.from ?? top, top);
            return (
              <g key={level.name}>
                <rect
                  x={PAD.left}
                  width={width - PAD.left - PAD.right}
                  y={y(to)}
                  height={y(level.from) - y(to)}
                  style={{ fill: level.solid }}
                  className="band chart-live-band"
                />
                {level.from > 0 && y(bands[i - 1]?.from ?? 0) - y(level.from) >= 14 && (
                  <text x={PAD.left - 8} y={y(level.from) + 4} textAnchor="end" className="axis">
                    {level.from}
                  </text>
                )}
              </g>
            );
          })}
          <text x={PAD.left - 8} y={y(0) + 4} textAnchor="end" className="axis">
            0
          </text>
          {fill !== null && (
            <path d={fill} fill={`url(#${gradientId})`} className="chart-live-area" />
          )}
          {path !== null && <path d={path} className="trace" />}
          <circle
            cx={x(last.atMs)}
            cy={y(now)}
            r={6}
            className="now-dot"
            style={levelVars(levelForAqi(now))}
          />
          {ticks.map((tick, i) => (
            <text
              key={tick.at}
              x={x(tick.at)}
              y={height - 8}
              textAnchor={i === 0 ? 'end' : 'middle'}
              className="axis"
            >
              {tick.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
