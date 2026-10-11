import { usAqi } from '@vayu/core';
import { scaleLinear } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';
import { useEffect, useId, useRef, useState } from 'react';
import { LEVELS, levelForAqi } from '../../design/levels';
import { levelVars } from '../../today/ui/format';

export interface LivePoint {
  readonly atMs: number;
  readonly pm25: number;
}

/** A moment the person marked (a purifier switched on, a window opened), drawn as a line down the chart. */
export interface LiveMark {
  readonly atMs: number;
  readonly label: string;
}

const PAD = { top: 12, right: 14, bottom: 26, left: 40 } as const;
const COMPACT_PAD = { top: 4, right: 4, bottom: 4, left: 4 } as const;
/** The window shows at least this much time, so the first few readings are not stretched across it. */
const MIN_SPAN_MS = 2 * 60_000;

export const windowMs = (points: readonly LivePoint[], maxSpanMs: number): number => {
  const last = points.at(-1);
  const first = points[0];
  if (last === undefined || first === undefined) return MIN_SPAN_MS;
  return Math.min(maxSpanMs, Math.max(MIN_SPAN_MS, last.atMs - first.atMs));
};

const aqiOf = (pm25: number): number => usAqi(pm25)?.value ?? 0;

/**
 * The room's air as it comes in: AQI over the standard six level bands, the area under the line washed in the level
 * colours, and a dot for now. The same drawing as "Last 48 hours", on a white card, but live: it moves with each
 * reading the unit sends. With `outsidePm25` a second, dashed line shows the air outside at the same moments, so the
 * gap between them is what the room's own air is doing (a purifier, a shut window). `compact` is the small version for
 * a card: no axes or labels, only the shape.
 */
export function LiveChart({
  points,
  height = 190,
  maxSpanMs = 10 * 60_000,
  outsidePm25,
  marks = [],
  compact = false,
  stretch = false,
}: {
  readonly points: readonly LivePoint[];
  readonly height?: number;
  readonly maxSpanMs?: number;
  readonly outsidePm25?: number;
  readonly marks?: readonly LiveMark[];
  readonly compact?: boolean;
  /** Take the height of the space it is given, instead of `height`. */
  readonly stretch?: boolean;
}): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);
  // The chart is not drawn until there are two readings, so it is measured once there are.
  const ready = points.length >= 2;
  const [box, setBox] = useState({ w: 320, h: height });
  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry?.contentRect.width ?? 0);
      const h = Math.round(entry?.contentRect.height ?? 0);
      if (w > 0) setBox({ w, h: stretch && h > 40 ? h : height });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [stretch, height, ready]);
  const width = box.w;
  const high = stretch ? box.h : height;
  const gradientId = useId();
  const last = points.at(-1);
  if (last === undefined || points.length < 2) return null;

  const pad = compact ? COMPACT_PAD : PAD;
  const span = windowMs(points, maxSpanMs);
  const from = last.atMs - span;
  const shown = points.filter((p) => p.atMs >= from).map((p) => ({ ...p, aqi: aqiOf(p.pm25) }));
  const outsideAqi = outsidePm25 === undefined ? undefined : aqiOf(outsidePm25);
  const peak = Math.max(...shown.map((p) => p.aqi), outsideAqi ?? 0);
  const low = Math.min(...shown.map((p) => p.aqi));
  const now = shown.at(-1)?.aqi ?? 0;
  const top = Math.max(100, Math.ceil((peak * 1.2) / 50) * 50);
  const x = scaleLinear()
    .domain([from, last.atMs])
    .range([pad.left, width - pad.right]);
  const y = scaleLinear()
    .domain([0, top])
    .range([high - pad.bottom, pad.top]);
  const path = line<(typeof shown)[number]>()
    .x((p) => x(p.atMs))
    .y((p) => y(p.aqi))
    .curve(curveMonotoneX)(shown);
  const fill = area<(typeof shown)[number]>()
    .x((p) => x(p.atMs))
    .y0(y(0))
    .y1((p) => y(p.aqi))
    .curve(curveMonotoneX)(shown);
  // A tick each minute (each two, then each five, for a long window), counted back from now.
  const step = span <= 5 * 60_000 ? 60_000 : span <= 12 * 60_000 ? 120_000 : 300_000;
  const ticks: { readonly at: number; readonly label: string }[] = [];
  for (let k = 0; last.atMs - k * step >= from; k++)
    ticks.push({
      at: last.atMs - k * step,
      label: k === 0 ? 'now' : `${String((k * step) / 60_000)} min ago`,
    });
  const bands = LEVELS.filter((level) => level.from < top);
  const minutes = Math.round(span / 60_000);

  return (
    <div className={`chart-live${compact ? ' compact' : ''}${stretch ? ' fill' : ''}`}>
      {!compact && (
        <div className="chart-live-head">
          <span className="chart-live-pill">
            <span className="chart-live-dot" aria-hidden="true" /> Live
          </span>
          <span className="muted small">
            AQI, last {String(minutes)} min{outsideAqi === undefined ? '' : ': room and outside'}
          </span>
        </div>
      )}
      <div ref={ref} className="chart" style={stretch ? undefined : { height }}>
        <svg
          width={width}
          height={high}
          role="img"
          aria-label={`AQI in the room over the last ${String(minutes)} minutes: low ${String(low)}, high ${String(peak)}, now ${String(now)}${outsideAqi === undefined ? '' : `; outside ${String(outsideAqi)}`}`}
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
                  x={pad.left}
                  width={width - pad.left - pad.right}
                  y={y(to)}
                  height={y(level.from) - y(to)}
                  style={{ fill: level.solid }}
                  className="band chart-live-band"
                />
                {!compact && level.from > 0 && y(bands[i - 1]?.from ?? 0) - y(level.from) >= 14 && (
                  <text x={pad.left - 8} y={y(level.from) + 4} textAnchor="end" className="axis">
                    {level.from}
                  </text>
                )}
              </g>
            );
          })}
          {!compact && (
            <text x={pad.left - 8} y={y(0) + 4} textAnchor="end" className="axis">
              0
            </text>
          )}
          {fill !== null && (
            <path d={fill} fill={`url(#${gradientId})`} className="chart-live-area" />
          )}
          {outsideAqi !== undefined && (
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(outsideAqi)}
              y2={y(outsideAqi)}
              className="chart-outside"
            />
          )}
          {marks
            .filter((m) => m.atMs >= from && m.atMs <= last.atMs)
            .map((m) => (
              <g key={m.atMs}>
                <line x1={x(m.atMs)} x2={x(m.atMs)} y1={pad.top} y2={y(0)} className="chart-mark" />
                {!compact && (
                  <text
                    x={x(m.atMs) + (x(m.atMs) > width * 0.6 ? -4 : 4)}
                    y={pad.top + 10}
                    textAnchor={x(m.atMs) > width * 0.6 ? 'end' : 'start'}
                    className="axis chart-mark-label"
                  >
                    {m.label}
                  </text>
                )}
              </g>
            ))}
          {path !== null && <path d={path} className="trace" />}
          <circle
            cx={x(last.atMs)}
            cy={y(now)}
            r={compact ? 4 : 6}
            className="now-dot"
            style={levelVars(levelForAqi(now))}
          />
          {!compact &&
            ticks.map((tick, i) => (
              <text
                key={tick.at}
                x={x(tick.at)}
                y={high - 8}
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
