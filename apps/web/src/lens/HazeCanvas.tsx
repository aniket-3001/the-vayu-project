import { useEffect, useRef } from 'react';
import type { Haze } from './model';

interface Speck {
  x: number;
  y: number;
  r: number;
  depth: number;
}

/**
 * The air itself: specks that hang and drift with the wind, more of them and a thicker fog as the air gets
 * worse. Drawn over the camera, or the sample scene. Still when motion is reduced, and paused when hidden.
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
          r: 1.5 + depth * 5.5,
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
          if (s.x < -10) s.x = width + 10;
          if (s.x > width + 10) s.x = -10;
          if (s.y < -10) s.y = height + 10;
          if (s.y > height + 10) s.y = -10;
        }
        ctx.fillStyle = h.level.solid;
        ctx.globalAlpha = 0.18 + s.depth * 0.3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
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
