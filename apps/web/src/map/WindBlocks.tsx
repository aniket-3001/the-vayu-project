import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { GRID } from './live';
import { angleBetween, HORIZON_DEG } from './sphere';
import type { Wind } from './wind';

/** Distance between blocks on screen, in pixels. */
const SPACING = 28;
/** How long one ripple takes to pass a block, in seconds, and how far apart ripples are, in pixels. */
const PERIOD = 3.4;
const WAVELENGTH = 110;

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
 * Wind as a field of short soft blocks that brighten and fade in a wave moving the way the air does, so the
 * flow reads without lines racing about. Quiet by design: translucent, never more than a few percent heavy.
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
        const len = Math.min(24, 8 + b.speed * 2.6);
        // A wave of brightness that travels along the wind: phase falls with distance along the flow.
        const along = b.x * b.dx + b.y * b.dy;
        const wave = reduced
          ? 0.7
          : 0.5 + 0.5 * Math.sin(2 * Math.PI * (seconds / PERIOD - along / WAVELENGTH));
        const alpha = Math.min(0.42, 0.16 + b.speed / 30) * (0.2 + 0.8 * wave) * b.edge;
        if (alpha < 0.005) continue;
        ctx.strokeStyle = `rgba(48, 84, 140, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 5 + Math.min(3, b.speed / 3);
        ctx.beginPath();
        ctx.moveTo(b.x - (b.dx * len) / 2, b.y - (b.dy * len) / 2);
        ctx.lineTo(b.x + (b.dx * len) / 2, b.y + (b.dy * len) / 2);
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
