import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { WORLD } from './live';
import { angleBetween, HORIZON_DEG } from './sphere';
import { advectWith, speedOf, type Wind } from './wind';

/** Roughly one star for each this many square pixels of map. */
const PIXELS_PER_STAR = 900;
const MAX_STARS = 700;
/** How many frames a star lives, how long its tail is, in positions kept. */
const LIFE_MIN = 90;
const LIFE_MAX = 170;
const TAIL = 56;
/** Half the widest the sliver gets, in pixels. */
const WIDTH = 2.5;

interface Star {
  lat: number;
  lng: number;
  age: number;
  life: number;
  /** Recent places on screen, newest first, which the tail is drawn through. */
  trail: { x: number; y: number }[];
}

/** The wind is drawn up to this zoom (about a city) and not beyond. */
export const WIND_MAX_ZOOM = 9;

/**
 * Wind as little shooting stars, the way Windy draws it: each one is born at a random spot, shoots along the
 * wind with a tapering tail a little broader than a line, and fades in as it starts and out as it ends. They
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
      const dpr = window.devicePixelRatio || 1;
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
        // Slow and steady, about the pace of the specks in the AR Lens.
        const px = (0.45 + Math.min(speed, 10) * 0.07) * zoomScale;
        const moved = map.unproject([here.x + (dx / length) * px, here.y + (dy / length) * px]);
        s.lat = moved.lat;
        s.lng = moved.lng;
      }
      s.age += 1;
    };

    const draw = (s: Star): void => {
      // Fade in as it is born and out as it ends; a sine over its life does both.
      const envelope = Math.sin(Math.PI * Math.min(1, s.age / s.life));
      if (envelope <= 0.02 || s.trail.length < 2) return;
      const speed = speedOf(field(s.lat, s.lng));
      const strength = Math.min(0.9, 0.5 + speed / 16) * envelope;
      const n = s.trail.length;
      // A sliver, as Windy draws it: full width a little behind the head, tapering to a point at the tail.
      // Drawn twice: the grey-blue body, then a narrower pale shine down its middle.
      const sliver = (scale: number, fill: string): void => {
        const left: { x: number; y: number }[] = [];
        const right: { x: number; y: number }[] = [];
        for (let i = 0; i < n; i++) {
          const here = s.trail[i];
          const before = s.trail[Math.max(0, i - 1)];
          const after = s.trail[Math.min(n - 1, i + 1)];
          if (here === undefined || before === undefined || after === undefined) return;
          const dx = before.x - after.x;
          const dy = before.y - after.y;
          const length = Math.hypot(dx, dy) || 1;
          const along = i / (n - 1);
          // Round at the head, a long taper behind it.
          const half = WIDTH * scale * (along < 0.12 ? 0.55 + along * 3.75 : (1 - along) ** 0.9);
          left.push({ x: here.x - (dy / length) * half, y: here.y + (dx / length) * half });
          right.push({ x: here.x + (dy / length) * half, y: here.y - (dx / length) * half });
        }
        ctx.beginPath();
        left.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        for (let i = right.length - 1; i >= 0; i--) {
          const p = right[i];
          if (p !== undefined) ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      sliver(1, `rgba(102, 126, 160, ${(strength * 0.65).toFixed(3)})`);
      sliver(0.38, `rgba(240, 246, 255, ${(strength * 0.85).toFixed(3)})`);
    };

    const tick = (): void => {
      if (stopped) return;
      if (!document.hidden) {
        ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);
        // Wind is a weather-scale thing: past city level its grid says nothing about a street, so it is not drawn.
        if (map.getZoom() > WIND_MAX_ZOOM) {
          frame = window.requestAnimationFrame(tick);
          return;
        }
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
      }
      frame = window.requestAnimationFrame(tick);
    };

    resize();
    rebuild();
    // When the view moves, the tails no longer line up with where the stars are, so start them again.
    const restart = (): void => {
      for (const s of stars) s.trail = [];
    };
    map.on('resize', resize);
    map.on('move', restart);

    if (reduced) {
      // One still picture: stars part-way through their lives, with tails drawn straight from the wind.
      ctx.lineCap = 'round';
      for (let n = 0; n < TAIL; n++) for (const s of stars) step(s, 1);
      for (const s of stars) {
        s.age = s.life / 2;
        draw(s);
      }
    } else {
      frame = window.requestAnimationFrame(tick);
    }
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      map.off('resize', resize);
      map.off('move', restart);
      ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);
    };
  }, [map, enabled, field]);

  return <canvas ref={canvas} className="wind-canvas" aria-hidden="true" />;
}
