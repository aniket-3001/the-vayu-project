import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { isNative } from '../native/splash';
import { WORLD } from './live';
import { angleBetween, HORIZON_DEG } from './sphere';
import { advectWith, speedOf, type Wind } from './wind';

/**
 * Roughly one star for each this many square pixels of map. A phone does the same drawing with a fraction of the
 * power of a laptop, so in the phone app there are fewer stars with shorter tails, drawn at about 30 frames a second.
 */
const PIXELS_PER_STAR = isNative() ? 2000 : 520;
const MAX_STARS = isNative() ? 160 : 1100;
/** How many frames a star lives, how long its tail is, in positions kept. */
const LIFE_MIN = 90;
const LIFE_MAX = 170;
const TAIL = isNative() ? 36 : 80;
/** The least time between two drawn frames: none on the website, so it is unchanged there. */
const MIN_FRAME_MS = isNative() ? 33 : 0;
/** The side of the square at a star's head, in pixels; the ones behind it are smaller. */
const SQUARE = 3;

interface Star {
  lat: number;
  lng: number;
  age: number;
  life: number;
  /** Recent places on screen, newest first, which the tail is drawn through. */
  trail: { x: number; y: number }[];
}

/** The wind is drawn at every zoom the map has: it thins, it does not vanish, as you come in. */
export const WIND_MAX_ZOOM = 18;

/**
 * Wind as little shooting stars, the way Windy draws it: each one is born at a random spot, shoots along the
 * wind with a tapering tail, and fades in as it starts and out as it ends. Each is built from small cold blue-white
 * squares, a larger one at the head and smaller, fainter ones behind it. They
 * follow the map as it pans and zooms, stay inside the area the wind data covers, hide round the back of the
 * globe, and hold still when the person prefers reduced motion.
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
    let stars: Star[] = [];
    let frame = 0;
    let stopped = false;

    const resize = (): void => {
      const box = map.getContainer().getBoundingClientRect();
      const dpr = isNative() ? 1 : window.devicePixelRatio || 1;
      el.width = Math.max(1, Math.round(box.width * dpr));
      el.height = Math.max(1, Math.round(box.height * dpr));
      el.style.width = `${String(box.width)}px`;
      el.style.height = `${String(box.height)}px`;
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
    const onFront = (lat: number, lng: number): boolean =>
      !isGlobe() || angleBetween({ lat, lng }, map.getCenter()) < HORIZON_DEG;

    const born = (): Star => {
      // A random place on screen that the wind data covers, so the stars fill the view at any zoom.
      for (let tries = 0; tries < 24; tries++) {
        const at = map.unproject([Math.random() * el.clientWidth, Math.random() * el.clientHeight]);
        if (inside(at.lat, at.lng) && onFront(at.lat, at.lng)) {
          const life = LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN);
          return { lat: at.lat, lng: at.lng, age: Math.random() * life, life, trail: [] };
        }
      }
      return { lat: WORLD.south, lng: WORLD.west, age: LIFE_MAX, life: LIFE_MAX, trail: [] };
    };

    const rebuild = (): void => {
      const count = Math.min(
        MAX_STARS,
        Math.round((el.clientWidth * el.clientHeight) / PIXELS_PER_STAR),
      );
      stars = Array.from({ length: count }, born);
    };

    /** Moves a star one step along the wind, a few pixels, faster when the wind is. */
    const step = (s: Star, zoomScale: number): void => {
      const here = map.project([s.lng, s.lat]);
      s.trail.unshift({ x: here.x, y: here.y });
      if (s.trail.length > TAIL) s.trail.pop();
      const wind = field(s.lat, s.lng);
      const speed = speedOf(wind);
      const ahead = advectWith(field, s.lat, s.lng, 3600);
      const probe = map.project([ahead.lng, ahead.lat]);
      const dx = probe.x - here.x;
      const dy = probe.y - here.y;
      const length = Math.hypot(dx, dy);
      if (length > 1e-6) {
        // Slow and steady, about the pace of the specks in the AIR Lens.
        const px = (0.45 + Math.min(speed, 10) * 0.07) * zoomScale;
        const moved = map.unproject([here.x + (dx / length) * px, here.y + (dy / length) * px]);
        s.lat = moved.lat;
        s.lng = moved.lng;
      }
      s.age += 1;
    };

    // In the phone app the squares are gathered by colour and filled together, so a frame costs a few dozen fills, not
    // thousands of colour strings to parse. The colours are rounded to a few steps, which the eye cannot tell apart.
    const batches = new Map<string, { style: string; rects: number[] }>();
    const flush = (): void => {
      for (const { style, rects } of batches.values()) {
        ctx.fillStyle = style;
        ctx.beginPath();
        for (let i = 0; i < rects.length; i += 3)
          ctx.rect(rects[i] ?? 0, rects[i + 1] ?? 0, rects[i + 2] ?? 1, rects[i + 2] ?? 1);
        ctx.fill();
      }
      batches.clear();
    };
    const gather = (x: number, y: number, size: number, along: number, alpha: number): void => {
      const step = Math.round(along * 6);
      const level = Math.round(alpha * 14);
      if (level <= 0) return;
      const key = `${String(step)}:${String(level)}`;
      let batch = batches.get(key);
      if (batch === undefined) {
        const r = Math.round(248 - (step / 6) * 96);
        const g = Math.round(252 - (step / 6) * 52);
        batch = {
          style: `rgba(${String(r)}, ${String(g)}, 255, ${(level / 14).toFixed(3)})`,
          rects: [],
        };
        batches.set(key, batch);
      }
      batch.rects.push(x, y, size);
    };

    const draw = (s: Star): void => {
      // Fade in as it is born and out as it ends; a sine over its life does both.
      const envelope = Math.sin(Math.PI * Math.min(1, s.age / s.life));
      if (envelope <= 0.02 || s.trail.length < 2) return;
      const speed = speedOf(field(s.lat, s.lng));
      // A little see-through, so the colour shows through the streak.
      const strength = Math.min(0.78, 0.5 + speed / 20) * envelope;
      const n = s.trail.length;
      // Built from squares, the way a pixel streak is: a square at the head, smaller ones behind it, each fainter than
      // the last, so it still reads as a shooting star with a tail. Cold: white at the head, going to icy blue.
      // Every second position is enough: the squares overlap, so the line has no gaps.
      for (let i = n - 1; i >= 0; i -= 2) {
        const p = s.trail[i];
        if (p === undefined) continue;
        const along = i / (n - 1);
        const size = along < 0.12 ? SQUARE : along < 0.4 ? SQUARE - 1 : 1;
        const alpha = strength * (1 - along) ** 1.15;
        if (alpha < 0.04) continue;
        const x = Math.round(p.x - size / 2);
        const y = Math.round(p.y - size / 2);
        if (isNative()) {
          gather(x, y, size, along, alpha);
          continue;
        }
        const r = Math.round(248 - along * 96);
        const g = Math.round(252 - along * 52);
        ctx.fillStyle = `rgba(${String(r)}, ${String(g)}, 255, ${alpha.toFixed(3)})`;
        ctx.fillRect(x, y, size, size);
      }
    };

    let lastDrawn = 0;
    const tick = (now = 0): void => {
      if (stopped) return;
      if (now - lastDrawn < MIN_FRAME_MS) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      lastDrawn = now;
      if (!document.hidden) {
        ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);
        // Wind is a weather-scale thing: past city level its grid says nothing about a street, so it is not drawn.
        if (map.getZoom() > WIND_MAX_ZOOM) {
          frame = window.requestAnimationFrame(tick);
          return;
        }
        follow();
        ctx.lineCap = 'round';
        const zoomScale = Math.min(1, 2 ** ((map.getZoom() - 3.2) * 0.5) + 0.25);
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          if (s === undefined) continue;
          step(s, zoomScale);
          const here = map.project([s.lng, s.lat]);
          const gone =
            s.age >= s.life ||
            !inside(s.lat, s.lng) ||
            !onFront(s.lat, s.lng) ||
            here.x < -20 ||
            here.y < -20 ||
            here.x > el.clientWidth + 20 ||
            here.y > el.clientHeight + 20;
          if (gone) stars[i] = born();
          else draw(s);
        }
        flush();
      }
      frame = window.requestAnimationFrame(tick);
    };

    // Following the map: three fixed places on the screen, and the ground they were over a frame ago. When the map is
    // dragged, rotated or zoomed, where that ground is now says how the picture was moved, and the stars' tails are
    // moved the same way, so the wind carries on across the move instead of starting again.
    const anchors: readonly (readonly [number, number])[] = [
      [0.3, 0.4],
      [0.7, 0.4],
      [0.5, 0.75],
    ];
    let ground: { lng: number; lat: number }[] | undefined;
    const follow = (): void => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const fixed = anchors.map(([fx, fy]) => ({ x: fx * w, y: fy * h }));
      if (ground !== undefined) {
        const now = ground.map((g) => map.project([g.lng, g.lat]));
        const [p0, p1, p2] = fixed;
        const [q0, q1, q2] = now;
        if (p0 && p1 && p2 && q0 && q1 && q2) {
          const moved = now.some((q, i) => {
            const p = fixed[i];
            return p === undefined || Math.hypot(q.x - p.x, q.y - p.y) > 0.05;
          });
          // The affine map that takes the three old places to where they are now.
          const det = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
          if (moved && Math.abs(det) > 1e-6 && now.every((q) => Number.isFinite(q.x + q.y))) {
            const dx1 = q1.x - q0.x;
            const dx2 = q2.x - q0.x;
            const dy1 = q1.y - q0.y;
            const dy2 = q2.y - q0.y;
            const a = (dx1 * (p2.y - p0.y) - dx2 * (p1.y - p0.y)) / det;
            const b = (dx2 * (p1.x - p0.x) - dx1 * (p2.x - p0.x)) / det;
            const d = (dy1 * (p2.y - p0.y) - dy2 * (p1.y - p0.y)) / det;
            const e = (dy2 * (p1.x - p0.x) - dy1 * (p2.x - p0.x)) / det;
            const c = q0.x - a * p0.x - b * p0.y;
            const f = q0.y - d * p0.x - e * p0.y;
            for (const s of stars) {
              for (const t of s.trail) {
                const x = t.x;
                t.x = a * x + b * t.y + c;
                t.y = d * x + e * t.y + f;
              }
            }
          }
        }
      }
      try {
        const next = fixed.map((p) => map.unproject([p.x, p.y]));
        ground = next.every((g) => Number.isFinite(g.lat + g.lng)) ? next : undefined;
      } catch {
        ground = undefined;
      }
    };
    // A resize changes the screen itself, so the places to follow are chosen again and the tails start afresh.
    const onResize = (): void => {
      resize();
      ground = undefined;
      for (const s of stars) s.trail = [];
    };
    resize();
    rebuild();
    map.on('resize', onResize);

    if (reduced) {
      // One still picture: stars part-way through their lives, with tails drawn straight from the wind.
      ctx.lineCap = 'round';
      for (let n = 0; n < TAIL; n++) for (const s of stars) step(s, 1);
      for (const s of stars) {
        s.age = s.life / 2;
        draw(s);
      }
      flush();
    } else {
      frame = window.requestAnimationFrame(tick);
    }
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      map.off('resize', onResize);
      ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);
    };
  }, [map, enabled, field]);

  return <canvas ref={canvas} className="wind-canvas" aria-hidden="true" />;
}
