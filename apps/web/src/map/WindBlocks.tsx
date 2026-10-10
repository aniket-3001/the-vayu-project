import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { GRID } from './live';
import { angleBetween, HORIZON_DEG } from './sphere';
import type { Wind } from './wind';

/** Distance between blocks on screen, in pixels. */
const SPACING = 28;
/** How far apart the waves are on screen, and how far each dash slides in one hop, in pixels. */
const WAVELENGTH = 120;
const TRAVEL = 34;

interface Block {
  x: number;
  y: number;
  /** Unit vector along the wind, on screen. */
  dx: number;
  dy: number;
  speed: number;
  /** 0 to 1, fading to 0 towards the edge of the data. */
  edge: number;
}

/**
 * Wind as a field of short soft dashes that slide the way the air blows and fade in and out as they go, lined
 * up into little waves, so the flow reads without lines racing about. Quiet by design: translucent.
 * It follows the map as it pans and zooms, hides round the back of the globe, and holds still when motion is
 * reduced.
 */
export function WindBlocks({
  map,
  enabled,
  field,
}: {
  readonly map: MapLibreMap | undefined;
  readonly enabled: boolean;
  /** The wind at any point: live from Open-Meteo, or a sample if that could not be reached. */
  readonly field: (lat: number, lng: number) => Wind;
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (el === null || map === undefined || !enabled) return;
    const ctx = el.getContext('2d');
    if (ctx === null) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let blocks: Block[] = [];
    let dirty = true;
    let stopped = false;
    let frame = 0;

    const resize = (): void => {
      const box = map.getContainer().getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.max(1, Math.round(box.width * dpr));
      el.height = Math.max(1, Math.round(box.height * dpr));
      el.style.width = `${String(box.width)}px`;
      el.style.height = `${String(box.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
    };

    /** Works out, for each point of a screen lattice, where the wind there blows, on screen. */
    const layout = (): void => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      const globe = map.getProjection().type === 'globe';
      const centre = map.getCenter();
      const next: Block[] = [];
      for (let y = SPACING / 2; y < height; y += SPACING) {
        for (let x = SPACING / 2; x < width; x += SPACING) {
          const at = map.unproject([x, y]);
          if (
            at.lat < GRID.south ||
            at.lat > GRID.north ||
            at.lng < GRID.west ||
            at.lng > GRID.east
          )
            continue;
          if (globe && angleBetween(at, centre) > HORIZON_DEG) continue;
          const wind = field(at.lat, at.lng);
          const speed = Math.hypot(wind.u, wind.v);
          if (speed < 0.05) continue;
          // Where the wind carries a point a little way, on screen, tells which way to draw the block.
          const ahead = map.project([
            at.lng + (wind.u / speed) * 0.4,
            at.lat + (wind.v / speed) * 0.4,
          ]);
          const length = Math.hypot(ahead.x - x, ahead.y - y);
          if (length < 1e-6) continue;
          const edge = Math.min(
            at.lat - GRID.south,
            GRID.north - at.lat,
            at.lng - GRID.west,
            GRID.east - at.lng,
          );
          next.push({
            x,
            y,
            dx: (ahead.x - x) / length,
            dy: (ahead.y - y) / length,
            speed,
            edge: Math.min(1, edge / 5),
          });
        }
      }
      blocks = next;
      dirty = false;
    };

    const draw = (seconds: number): void => {
      ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);
      ctx.lineCap = 'round';
      for (const b of blocks) {
        // Each dash slides along the wind and fades in and out as it goes, one hop at a time. Neighbours are
        // timed so the dashes line up into waves that roll with the flow; stronger wind rolls faster.
        const along = b.x * b.dx + b.y * b.dy;
        const rate = 1 / Math.max(1.6, 4.4 - b.speed * 0.45);
        const phase = reduced ? 0.5 : (((seconds * rate - along / WAVELENGTH) % 1) + 1) % 1;
        const fade = Math.sin(Math.PI * phase) ** 1.4;
        const alpha = Math.min(0.5, 0.2 + b.speed / 24) * fade * b.edge;
        if (alpha < 0.01) continue;
        const len = Math.min(26, 10 + b.speed * 2.4);
        const hop = (phase - 0.5) * TRAVEL;
        // A slight sideways sway, so the motion reads as a ripple and not a conveyor belt.
        const sway = reduced ? 0 : Math.sin(2 * Math.PI * (phase + along / WAVELENGTH)) * 2.2;
        const cx = b.x + b.dx * hop - b.dy * sway;
        const cy = b.y + b.dy * hop + b.dx * sway;
        ctx.strokeStyle = `rgba(44, 82, 140, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 5 + Math.min(2.5, b.speed / 3);
        ctx.beginPath();
        ctx.moveTo(cx - (b.dx * len) / 2, cy - (b.dy * len) / 2);
        ctx.lineTo(cx + (b.dx * len) / 2, cy + (b.dy * len) / 2);
        ctx.stroke();
      }
    };

    const loop = (now: number): void => {
      if (stopped) return;
      if (!document.hidden) {
        if (dirty) layout();
        draw(now / 1000);
      }
      frame = window.requestAnimationFrame(loop);
    };

    const markDirty = (): void => {
      dirty = true;
    };
    resize();
    map.on('resize', resize);
    map.on('move', markDirty);
    map.on('moveend', markDirty);
    map.on('projectiontransition', markDirty);
    if (reduced) {
      layout();
      draw(0);
      map.on('moveend', () => {
        if (!stopped) {
          layout();
          draw(0);
        }
      });
    } else {
      frame = window.requestAnimationFrame(loop);
    }
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      map.off('resize', resize);
      map.off('move', markDirty);
      map.off('moveend', markDirty);
      map.off('projectiontransition', markDirty);
      ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);
    };
  }, [map, enabled, field]);

  return <canvas ref={canvas} className="wind-canvas" aria-hidden="true" />;
}
