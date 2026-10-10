import { useEffect, useRef } from 'react';
import type { Haze } from './model';

interface Speck {
  x: number;
  y: number;
  r: number;
  depth: number;
}

/** Sprites are drawn once for each colour and size, then stamped, so hundreds of specks stay light. */
const SPRITE_SCALE = 2;
const sprites = new Map<string, HTMLCanvasElement>();

/**
 * One speck: a smoky dark halo, the air's colour inside a black outline, and a few fine black flecks around it, like
 * spray paint. The colour is the level's colour, so the AQI is still what you read.
 */
function spriteFor(color: string, radius: number): HTMLCanvasElement {
  const bucket = Math.max(2, Math.round(radius));
  const key = `${color}|${String(bucket)}`;
  const known = sprites.get(key);
  if (known !== undefined) return known;
  const halo = bucket * 2.8;
  const size = Math.ceil(halo * 2 * SPRITE_SCALE);
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext('2d');
  if (ctx !== null) {
    ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
    const c = halo;
    // The smoke: dark in the middle, fading to nothing.
    const smoke = ctx.createRadialGradient(c, c, bucket * 0.6, c, c, halo);
    smoke.addColorStop(0, 'rgb(25 25 30 / 0.34)');
    smoke.addColorStop(0.55, 'rgb(25 25 30 / 0.12)');
    smoke.addColorStop(1, 'rgb(25 25 30 / 0)');
    ctx.fillStyle = smoke;
    ctx.beginPath();
    ctx.arc(c, c, halo, 0, Math.PI * 2);
    ctx.fill();
    // The spray: fine dark flecks that thin out with distance. A fixed pattern per size, so it does not flicker.
    let seed = bucket * 7919;
    const next = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 9 + bucket * 2; i++) {
      const angle = next() * Math.PI * 2;
      const distance = bucket * (1.1 + next() * 1.6);
      ctx.fillStyle = `rgb(20 20 25 / ${String(0.25 + next() * 0.4)})`;
      ctx.beginPath();
      ctx.arc(
        c + Math.cos(angle) * distance,
        c + Math.sin(angle) * distance,
        0.3 + next() * 0.7,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    // The speck: the level's colour, with a black outline.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c, c, bucket, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1, bucket * 0.22);
    ctx.strokeStyle = 'rgb(20 20 25 / 0.85)';
    ctx.stroke();
  }
  sprites.set(key, sprite);
  return sprite;
}

/**
 * The air itself: specks that hang and drift with the wind, more of them and a thicker fog as the air gets
 * worse. Each is the colour of the AQI with a black outline and a smoky halo. Drawn over the camera, or the sample
 * scene. Still when motion is reduced, and paused when hidden.
 */
export function HazeCanvas({
  haze,
  windToDeg,
  windKmh,
}: {
  readonly haze: Haze;
  /** Where the wind is going, clockwise from straight up the screen. */
  readonly windToDeg: number;
  readonly windKmh: number;
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ haze, windToDeg, windKmh });
  live.current = { haze, windToDeg, windKmh };

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d') ?? null;
    if (el === null || ctx === null) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let specks: Speck[] = [];
    let frame = 0;
    let width = 0;
    let height = 0;

    const resize = (): void => {
      const box = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // Keep the specks where they were, in proportion, when the screen changes size.
      if (width > 0 && height > 0) {
        for (const s of specks) {
          s.x = (s.x / width) * box.width;
          s.y = (s.y / height) * box.height;
        }
      }
      width = box.width;
      height = box.height;
      el.width = Math.max(1, Math.round(width * dpr));
      el.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const populate = (count: number): void => {
      while (specks.length < count) {
        const depth = Math.random();
        specks.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: 2.2 + depth * 5.3,
          depth,
        });
      }
      specks = specks.slice(0, count);
    };
    const draw = (move: boolean): void => {
      const { haze: h, windToDeg: to, windKmh: kmh } = live.current;
      populate(h.specks);
      ctx.clearRect(0, 0, width, height);
      const rad = (to * Math.PI) / 180;
      const speed = 0.12 + kmh * 0.035;
      for (const s of specks) {
        if (move) {
          s.x += Math.sin(rad) * speed * (0.4 + s.depth);
          s.y += -Math.cos(rad) * speed * (0.4 + s.depth) * 0.6;
          if (s.x < -20) s.x = width + 20;
          if (s.x > width + 20) s.x = -20;
          if (s.y < -20) s.y = height + 20;
          if (s.y > height + 20) s.y = -20;
        }
        const sprite = spriteFor(h.level.solid, s.r);
        ctx.globalAlpha = 0.45 + s.depth * 0.5;
        ctx.drawImage(
          sprite,
          s.x - sprite.width / SPRITE_SCALE / 2,
          s.y - sprite.height / SPRITE_SCALE / 2,
          sprite.width / SPRITE_SCALE,
          sprite.height / SPRITE_SCALE,
        );
      }
      ctx.globalAlpha = 1;
    };
    const loop = (): void => {
      if (!document.hidden) draw(true);
      frame = window.requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener('resize', resize);
    if (reduced) draw(false);
    else frame = window.requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <div
        className="veil"
        aria-hidden="true"
        style={{
          background: `linear-gradient(to bottom, rgb(255 255 255 / 0), color-mix(in srgb, ${haze.level.solid} ${String(Math.round(haze.veil * 100))}%, transparent) 70%)`,
        }}
      />
      <canvas ref={canvas} className="specks" aria-hidden="true" />
    </>
  );
}
