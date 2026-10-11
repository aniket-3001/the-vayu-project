import { useEffect, useRef } from 'react';

/** What the sheet's background is showing: rain falling, smog drifting, smoke rising, or a GRAP stage's haze. */
export type ParticleKind = 'rain' | 'smog' | 'smoke' | 'grap';

/** The colour of each GRAP stage, as the cards use it: yellow, orange, red, purple. */
const STAGE_RGB: Readonly<Record<number, readonly [number, number, number]>> = {
  1: [245, 196, 0],
  2: [240, 138, 36],
  3: [224, 49, 49],
  4: [142, 68, 216],
};

interface Speck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
}

const seeded = (n: number): (() => number) => {
  let s = n;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

/**
 * A moving picture behind an alert, in the spirit of a weather app: raindrops for rain, drifting haze and dust for a
 * smog day, rising smoke for burning, and for a GRAP stage the same specks as the AIR Lens, in the stage's colour
 * and as thick as the stage is bad. It stays still for people who ask for less motion, and never takes a tap.
 */
export function AirParticles({
  kind,
  stage = 1,
}: {
  readonly kind: ParticleKind;
  readonly stage?: number;
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (el === null) return undefined;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = el.getContext('2d');
    } catch {
      ctx = null;
    }
    if (ctx === null) return undefined;
    const draw = ctx;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const random = seeded(kind.length * 7919 + stage);
    let width = 1;
    let height = 1;
    let specks: Speck[] = [];
    let frame = 0;
    let last = performance.now();

    const rgb = STAGE_RGB[stage] ?? STAGE_RGB[1] ?? [245, 196, 0];

    const build = (): void => {
      const count =
        kind === 'rain' ? 110 : kind === 'grap' ? 14 + stage * 11 : kind === 'smoke' ? 16 : 70;
      specks = Array.from({ length: count }, () => ({
        x: random() * width,
        y: random() * height,
        vx: kind === 'rain' ? -30 - random() * 20 : (random() - 0.4) * 14,
        vy:
          kind === 'rain'
            ? 380 + random() * 320
            : kind === 'smoke'
              ? -(14 + random() * 24)
              : (random() - 0.5) * 8,
        r:
          kind === 'rain'
            ? 9 + random() * 14
            : kind === 'smoke'
              ? 30 + random() * 46
              : 1.2 + random() * (kind === 'grap' ? 3.2 : 2.2),
        phase: random() * Math.PI * 2,
      }));
    };

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1;
      width = Math.max(1, el.clientWidth);
      height = Math.max(1, el.clientHeight);
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      draw.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };

    const paint = (dt: number, now: number): void => {
      draw.clearRect(0, 0, width, height);
      if (kind === 'rain') {
        // A cool veil, then the drops: slanted lines that fall and start again at the top.
        const veil = draw.createLinearGradient(0, 0, 0, height);
        veil.addColorStop(0, 'rgba(120,150,190,0.22)');
        veil.addColorStop(1, 'rgba(120,150,190,0.05)');
        draw.fillStyle = veil;
        draw.fillRect(0, 0, width, height);
        draw.lineCap = 'round';
        for (const s of specks) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          if (s.y > height + s.r) {
            s.y = -s.r;
            s.x = random() * (width + 40);
          }
          draw.strokeStyle = 'rgba(96,140,200,0.55)';
          draw.lineWidth = 1.5;
          draw.beginPath();
          draw.moveTo(s.x, s.y);
          draw.lineTo(s.x + (s.vx / s.vy) * s.r, s.y - s.r);
          draw.stroke();
        }
        return;
      }
      if (kind === 'smoke') {
        for (const s of specks) {
          s.x += (s.vx + Math.sin(now / 1500 + s.phase) * 6) * dt;
          s.y += s.vy * dt;
          if (s.y < -s.r) {
            s.y = height + s.r;
            s.x = random() * width;
          }
          const g = draw.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
          g.addColorStop(0, 'rgba(120,100,90,0.32)');
          g.addColorStop(1, 'rgba(120,100,90,0)');
          draw.fillStyle = g;
          draw.beginPath();
          draw.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          draw.fill();
        }
        return;
      }
      // Smog and a GRAP stage: a haze that drifts, and specks of dust hanging in it.
      const tint = kind === 'grap' ? rgb : ([110, 100, 92] as const);
      const veil = draw.createLinearGradient(0, 0, 0, height);
      veil.addColorStop(
        0,
        `rgba(${String(tint[0])},${String(tint[1])},${String(tint[2])},${kind === 'grap' ? '0.16' : '0.22'})`,
      );
      veil.addColorStop(1, `rgba(${String(tint[0])},${String(tint[1])},${String(tint[2])},0.04)`);
      draw.fillStyle = veil;
      draw.fillRect(0, 0, width, height);
      for (let i = 0; i < 5; i++) {
        const cx = ((now / 40 + i * 190) % (width + 320)) - 160;
        const cy = height * (0.2 + 0.16 * i) + Math.sin(now / 2600 + i) * 14;
        const g = draw.createRadialGradient(cx, cy, 0, cx, cy, 150);
        g.addColorStop(0, `rgba(${String(tint[0])},${String(tint[1])},${String(tint[2])},0.2)`);
        g.addColorStop(1, `rgba(${String(tint[0])},${String(tint[1])},${String(tint[2])},0)`);
        draw.fillStyle = g;
        draw.beginPath();
        draw.arc(cx, cy, 150, 0, Math.PI * 2);
        draw.fill();
      }
      for (const s of specks) {
        s.x += (s.vx + Math.sin(now / 1700 + s.phase) * 5) * dt;
        s.y += (s.vy + Math.cos(now / 2100 + s.phase) * 4) * dt;
        if (s.x < -10) s.x = width + 10;
        if (s.x > width + 10) s.x = -10;
        if (s.y < -10) s.y = height + 10;
        if (s.y > height + 10) s.y = -10;
        draw.beginPath();
        draw.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        if (kind === 'grap') {
          // As in the AIR Lens: a coloured speck with a dark outline.
          draw.fillStyle = `rgba(${String(tint[0])},${String(tint[1])},${String(tint[2])},0.55)`;
          draw.fill();
          draw.strokeStyle = 'rgba(40,40,50,0.4)';
          draw.lineWidth = 1.2;
          draw.stroke();
        } else {
          draw.fillStyle = 'rgba(90,80,72,0.5)';
          draw.fill();
        }
      }
    };

    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      paint(dt, now);
      frame = window.requestAnimationFrame(tick);
    };

    resize();
    const watcher = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
    watcher?.observe(el);
    if (reduced) paint(0.016, 0);
    else frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      watcher?.disconnect();
    };
  }, [kind, stage]);

  return <canvas ref={canvas} className="air-particles" aria-hidden="true" data-kind={kind} />;
}
