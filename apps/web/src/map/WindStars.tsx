import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { GRID } from './live';
import { angleBetween, HORIZON_DEG } from './sphere';
import { advectWith, speedOf, type Wind } from './wind';

/** Roughly one star for each this many square pixels of map. */
const PIXELS_PER_STAR = 900;
const MAX_STARS = 700;
/** How many frames a star lives, how long its tail is, in positions kept. */
const LIFE_MIN = 34;
const LIFE_MAX = 78;
const TAIL = 16;

interface Star {
  lat: number;
  lng: number;
  age: number;
  life: number;
  /** Recent places on screen, newest first, which the tail is drawn through. */
  trail: { x: number; y: number }[];
}

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
      lat >= GRID.south && lat <= GRID.north && lng >= GRID.west && lng <= GRID.east;
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
      return { lat: GRID.south, lng: GRID.west, age: LIFE_MAX, life: LIFE_MAX, trail: [] };
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
        const px = (1.4 + speed * 0.55) * zoomScale;
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
      const strength = Math.min(0.85, 0.35 + speed / 14) * envelope;
      const head = s.trail[0];
      if (head === undefined) return;
      // The tail, from the tip backwards: each piece thinner and fainter than the one before.
      for (let i = 1; i < s.trail.length; i++) {
        const from = s.trail[i - 1];
        const to = s.trail[i];
        if (from === undefined || to === undefined) continue;
        const along = 1 - i / s.trail.length;
        ctx.strokeStyle = `rgba(40, 78, 140, ${(strength * along * along).toFixed(3)})`;
        ctx.lineWidth = 0.8 + 3.4 * along;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
      // A bright point at the head makes it a star and not just a streak.
      ctx.fillStyle = `rgba(255, 255, 255, ${(strength * 0.9).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    };

    const tick = (): void => {
      if (stopped) return;
      if (!document.hidden) {
        ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);
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
