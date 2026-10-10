import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { GRID } from './live';
import { advectWith, speedOf, type Wind } from './wind';

/** About one streak for every this many square pixels of map. */
const PIXELS_PER_PARTICLE = 210;
const LIFE_FRAMES = 80;
/** Past this angular distance from the centre of the view, a point is round the back of the globe. */
const HORIZON_DEG = 78;

interface Particle {
  lat: number;
  lng: number;
  age: number;
}

const rad = (d: number): number => (d * Math.PI) / 180;

/** Angular distance in degrees between two points on the sphere. */
export function angleBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const c =
    Math.sin(rad(a.lat)) * Math.sin(rad(b.lat)) +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(a.lng - b.lng));
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

/**
 * Wind as moving streaks over the map, Windy-style. The streaks are drawn on a canvas above the map
 * and follow it as it pans, zooms or turns into a globe. Stops when hidden, and shows still streaks
 * when the person prefers reduced motion.
 */
export function WindCanvas({
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
    const inside = (lat: number, lng: number): boolean =>
      lat >= GRID.south && lat <= GRID.north && lng >= GRID.west && lng <= GRID.east;
    const spawn = (): Particle => {
      // A random spot on screen that the wind data covers, so streaks fill the view; round the back of a globe is skipped.
      for (let tries = 0; tries < 24; tries++) {
        const at = map.unproject([Math.random() * el.clientWidth, Math.random() * el.clientHeight]);
        const onFront =
          map.getProjection().type !== 'globe' ||
          angleBetween({ lat: at.lat, lng: at.lng }, map.getCenter()) < HORIZON_DEG;
        if (onFront && inside(at.lat, at.lng)) {
          return { lat: at.lat, lng: at.lng, age: Math.floor(Math.random() * LIFE_FRAMES) };
        }
      }
      return {
        lat: GRID.south + Math.random() * (GRID.north - GRID.south),
        lng: GRID.west + Math.random() * (GRID.east - GRID.west),
        age: LIFE_FRAMES,
      };
    };
    const count = Math.round(
      Math.min(
        3200,
        (map.getContainer().clientWidth * map.getContainer().clientHeight) / PIXELS_PER_PARTICLE,
      ),
    );
    let particles: Particle[] = [];
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
    const clear = (): void => {
      ctx.clearRect(0, 0, el.width, el.height);
    };

    const step = (): void => {
      const centre = map.getCenter();
      // Zoomed far out the whole region is a few hundred pixels, so streaks shrink with it.
      const zoomScale = Math.min(1, 2 ** ((map.getZoom() - 3.2) * 0.5));
      const globe = map.getProjection().type === 'globe';
      const width = el.clientWidth;
      const height = el.clientHeight;
      // Fade what was drawn, so each streak leaves a tail.
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = 'rgba(0,0,0,0.955)';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      for (const p of particles) {
        const here = map.project([p.lng, p.lat]);
        const wind = field(p.lat, p.lng);
        const speed = speedOf(wind);
        // Which way the wind points on screen, from where a parcel of air would be in an hour.
        const ahead = advectWith(field, p.lat, p.lng, 3600);
        const probe = map.project([ahead.lng, ahead.lat]);
        const dx = probe.x - here.x;
        const dy = probe.y - here.y;
        const length = Math.hypot(dx, dy);
        const visible =
          here.x >= 0 &&
          here.x <= width &&
          here.y >= 0 &&
          here.y <= height &&
          (!globe ||
            angleBetween({ lat: p.lat, lng: p.lng }, { lat: centre.lat, lng: centre.lng }) <
              HORIZON_DEG);
        if (length > 1e-6) {
          // Steps are a few pixels whatever the zoom, so the flow always looks alive; faster wind, longer step.
          const stepPx = (1.1 + speed * 0.45) * zoomScale;
          const there = { x: here.x + (dx / length) * stepPx, y: here.y + (dy / length) * stepPx };
          if (visible) {
            const fade = Math.min(1, p.age / 12, (LIFE_FRAMES - p.age) / 12);
            ctx.strokeStyle = `rgba(70, 104, 150, ${String(Math.min(0.26, 0.09 + speed / 45) * fade)})`;
            ctx.beginPath();
            ctx.moveTo(here.x, here.y);
            ctx.lineTo(there.x, there.y);
            ctx.stroke();
          }
          const moved = map.unproject([there.x, there.y]);
          p.lat = moved.lat;
          p.lng = moved.lng;
        }
        p.age += 1;
        if (p.age > LIFE_FRAMES || !visible || !inside(p.lat, p.lng)) {
          Object.assign(p, spawn(), { age: 0 });
        }
      }
    };

    const loop = (): void => {
      if (stopped) return;
      if (!document.hidden) step();
      frame = window.requestAnimationFrame(loop);
    };

    resize();
    particles = Array.from({ length: count }, spawn);
    map.on('resize', resize);
    map.on('movestart', clear);
    map.on('move', clear);
    map.on('projectiontransition', clear);

    if (reduced) {
      // One still picture of the flow, with nothing moving.
      for (let i = 0; i < 40; i++) step();
    } else {
      frame = window.requestAnimationFrame(loop);
    }

    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      map.off('resize', resize);
      map.off('movestart', clear);
      map.off('move', clear);
      map.off('projectiontransition', clear);
      clear();
    };
  }, [map, enabled, field]);

  return <canvas ref={canvas} className="wind-canvas" aria-hidden="true" />;
}
