import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { isNative } from '../native/splash';
import { WORLD } from './live';
import { angleBetween, HORIZON_DEG } from './sphere';
import type { Wind } from './wind';
import {
  advanceStreak,
  buildFlowGrid,
  LIFE_MAX,
  LIFE_MIN,
  newStreak,
  sampleFlow,
  streakAlpha,
  type FlowGrid,
  type Streak,
} from './windFlow';

/**
 * Roughly one streak for each this many square pixels of map. A phone does the same drawing with a fraction of the
 * power of a laptop, so in the phone app there are fewer, drawn at about 30 frames a second.
 */
const PIXELS_PER_STREAK = isNative() ? 600 : 340;
const MAX_STREAKS = isNative() ? 600 : 3200;
/** The least time between two drawn frames: none on the website, so it is as fast as the screen. */
const MIN_FRAME_MS = isNative() ? 40 : 0;
/** What is left of the picture after each frame: the trail is what has not yet faded. */
const KEEP = 0.94;

/** The wind is drawn at every zoom the map has: it thins, it does not vanish, as you come in. */
export const WIND_MAX_ZOOM = 18;

/**
 * Wind as flowing streaks, the way Windy draws it: a great many fine white lines, each carried along the wind with a
 * fading tail, starting and ending at random places so the whole field is always moving. They flow in screen pixels
 * over a grid of the wind worked out when the map stops (see windFlow.ts), so a frame costs a few thousand short
 * lines and no map calls. While the map is being dragged or zoomed they pause and clear, and start again when it
 * settles. They stay inside the area the wind data covers, hide round the back of the globe, and hold still, as a
 * picture, when the person prefers reduced motion.
 */
export function WindStars({
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
    let width = 0;
    let height = 0;
    let streaks: Streak[] = [];
    let grid: FlowGrid | undefined;
    let frame = 0;
    let stopped = false;
    let moving = false;
    let lastDrawn = 0;

    const resize = (): void => {
      const box = el.getBoundingClientRect();
      const dpr = isNative() ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      width = box.width;
      height = box.height;
      el.width = Math.max(1, Math.round(width * dpr));
      el.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const inside = (lat: number, lng: number): boolean =>
      lat >= WORLD.south && lat <= WORLD.north && lng >= WORLD.west && lng <= WORLD.east;
    /** Before the style has loaded the map has no projection yet; treat it as the globe it will become. */
    const isGlobe = (): boolean => {
      try {
        return map.getProjection().type === 'globe';
      } catch {
        return true;
      }
    };
    const onGround = (x: number, y: number): { lat: number; lng: number } | undefined => {
      try {
        const at = map.unproject([x, y]);
        if (!Number.isFinite(at.lat + at.lng) || !inside(at.lat, at.lng)) return undefined;
        if (isGlobe() && angleBetween({ lat: at.lat, lng: at.lng }, map.getCenter()) >= HORIZON_DEG)
          return undefined;
        return { lat: at.lat, lng: at.lng };
      } catch {
        return undefined;
      }
    };

    /** The wind as the screen now shows it. Worked out when the map has stopped, never while it moves. */
    const settle = (): void => {
      resize();
      grid = buildFlowGrid({
        width,
        height,
        unproject: onGround,
        project: (lat, lng) => {
          const p = map.project([lng, lat]);
          return { x: p.x, y: p.y };
        },
        field,
      });
      const count = Math.min(MAX_STREAKS, Math.round((width * height) / PIXELS_PER_STREAK));
      streaks = Array.from({ length: count }, () => newStreak(width, height, Math.random));
      ctx.clearRect(0, 0, width, height);
      moving = false;
    };

    const respawn = (s: Streak): void => {
      // A random place on screen that the wind covers: a few tries, and if none does it waits and tries next frame.
      for (let tries = 0; tries < 6; tries++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        if (grid !== undefined && sampleFlow(grid, x, y) === undefined) continue;
        s.x = x;
        s.y = y;
        s.px = x;
        s.py = y;
        s.age = 0;
        s.life = LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN);
        return;
      }
      s.age = 0;
    };

    const draw = (): void => {
      if (grid === undefined) return;
      // Fade what is already drawn, so each streak leaves a tail that dims behind it.
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = `rgba(0, 0, 0, ${String(KEEP)})`;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      ctx.lineWidth = isNative() ? 1.4 : 1.2;
      // Four strengths of white, each drawn as one path, so a frame is four strokes however many streaks there are.
      const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      for (const s of streaks) {
        if (!advanceStreak(grid, s, width, height)) {
          respawn(s);
          continue;
        }
        const a = streakAlpha(s);
        if (a < 0.08) continue;
        const bucket = Math.min(3, Math.floor(a * 4));
        const path = paths[bucket];
        path?.moveTo(s.px, s.py);
        path?.lineTo(s.x, s.y);
      }
      const alphas = [0.3, 0.5, 0.72, 0.92];
      paths.forEach((path, i) => {
        ctx.strokeStyle = `rgba(255, 255, 255, ${String(alphas[i] ?? 0.9)})`;
        ctx.stroke(path);
      });
    };

    const tick = (now: number): void => {
      if (stopped) return;
      if (!moving && !document.hidden && now - lastDrawn >= MIN_FRAME_MS) {
        lastDrawn = now;
        draw();
      }
      frame = window.requestAnimationFrame(tick);
    };

    // Dragging or zooming moves the ground under the streaks, so they clear and wait; when the map settles they start
    // again over the wind as it now lies.
    const onStart = (): void => {
      moving = true;
      ctx.clearRect(0, 0, width, height);
    };
    const onEnd = (): void => {
      settle();
    };
    map.on('movestart', onStart);
    map.on('moveend', onEnd);
    map.on('resize', onEnd);
    settle();

    if (reduced) {
      // One still picture: the streaks run on for a while with no fading away, and then stop.
      for (let n = 0; n < 40; n++) draw();
    } else {
      frame = window.requestAnimationFrame(tick);
    }
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      map.off('movestart', onStart);
      map.off('moveend', onEnd);
      map.off('resize', onEnd);
      ctx.clearRect(0, 0, width, height);
    };
  }, [map, enabled, field]);

  return <canvas ref={canvas} className="wind-canvas" aria-hidden="true" />;
}
