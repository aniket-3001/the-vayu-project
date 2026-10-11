import { useEffect, useRef } from 'react';

/**
 * What a canvas is showing behind an alert:
 * - `rain`: dark clouds along the top and white drops falling from them;
 * - `drip`: drops condensing on a pane and sliding down it (for the text card in a rain scene);
 * - `sparks`: a low flame, bright sparks flying up and smoke rising (for burning);
 * - `wind`: streaks of wind carrying leaves and dust;
 * - `smog`: a dim sun behind drifting haze and dust;
 * - `grap`: the AIR Lens's specks, in the colour of the stage's level.
 */
export type ParticleKind = 'rain' | 'drip' | 'sparks' | 'wind' | 'smog' | 'grap';

export type Rgb = readonly [number, number, number];

const rgba = (c: Rgb, a: number): string =>
  `rgba(${String(c[0])},${String(c[1])},${String(c[2])},${String(Math.max(0, Math.min(1, a)))})`;

const seeded = (n: number): (() => number) => {
  let s = n;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

interface Painter {
  /** Called when the canvas has a size, and again when it changes. */
  readonly resize: (w: number, h: number) => void;
  /** `dt` is seconds since the last frame, `now` is milliseconds. */
  readonly paint: (ctx: CanvasRenderingContext2D, dt: number, now: number) => void;
}

interface Options {
  readonly random: () => number;
  /** Fewer, smaller things: for a row in a list rather than a whole sheet. */
  readonly compact: boolean;
  readonly tint: Rgb;
  readonly stage: number;
}

const blob = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  colour: Rgb,
  alpha: number,
): void => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(colour, alpha));
  g.addColorStop(1, rgba(colour, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};

/** Dark clouds drifting along the top, with white drops falling from them. */
function rainPainter({ random, compact }: Options): Painter {
  let w = 1;
  let h = 1;
  interface Cloud {
    x: number;
    y: number;
    r: number;
    speed: number;
  }
  interface Drop {
    x: number;
    y: number;
    v: number;
    len: number;
    a: number;
  }
  let clouds: Cloud[] = [];
  let drops: Drop[] = [];
  const cloudLine = (): number => (compact ? Math.min(h * 0.3, 18) : Math.min(h * 0.14, 70));
  const newDrop = (anywhere: boolean): Drop => ({
    x: random() * (w + 40),
    y: anywhere ? random() * h : cloudLine() * (0.4 + random() * 0.6),
    v: (compact ? 190 : 300) + random() * 260,
    len: (compact ? 6 : 9) + random() * 10,
    a: 0.35 + random() * 0.4,
  });
  return {
    resize(width, height) {
      w = width;
      h = height;
      const nClouds = Math.max(5, Math.round(w / (compact ? 60 : 90)));
      clouds = Array.from({ length: nClouds }, (_, i) => ({
        x: (i / nClouds) * (w + 160) - 80 + (random() - 0.5) * 40,
        y: random() * cloudLine() * 0.7,
        r: (compact ? 22 : 44) + random() * (compact ? 14 : 30),
        speed: 4 + random() * 9,
      }));
      const n = compact ? 24 : Math.max(40, Math.min(120, Math.round((w * h) / 4200)));
      drops = Array.from({ length: n }, () => newDrop(true));
    },
    paint(ctx, dt) {
      ctx.clearRect(0, 0, w, h);
      for (const c of clouds) {
        c.x += c.speed * dt;
        if (c.x - c.r > w) c.x = -c.r * 1.6;
        blob(ctx, c.x, c.y, c.r * 1.3, [48, 58, 78], 0.78);
        blob(ctx, c.x + c.r * 0.7, c.y + c.r * 0.15, c.r, [62, 74, 96], 0.7);
        blob(ctx, c.x - c.r * 0.6, c.y + c.r * 0.2, c.r * 0.85, [70, 82, 104], 0.6);
      }
      ctx.lineCap = 'round';
      ctx.lineWidth = compact ? 1.1 : 1.5;
      for (const d of drops) {
        d.y += d.v * dt;
        d.x -= d.v * 0.1 * dt;
        if (d.y - d.len > h) Object.assign(d, newDrop(false));
        if (d.x < -20) d.x = w + 10;
        ctx.strokeStyle = `rgba(255,255,255,${String(d.a)})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * 0.1, d.y - d.len);
        ctx.stroke();
      }
    },
  };
}

/** Drops condensing on a pane, growing until they are heavy, then sliding down and leaving a trail. */
function dripPainter({ random, compact }: Options): Painter {
  let w = 1;
  let h = 1;
  interface Bead {
    x: number;
    y: number;
    startY: number;
    r: number;
    maxR: number;
    v: number;
    phase: number;
    state: 'grow' | 'slide' | 'fade';
    alpha: number;
  }
  let beads: Bead[] = [];
  let mist: { x: number; y: number; r: number }[] = [];
  const born = (anywhere: boolean): Bead => {
    // Biased to the top of the pane, where the rain lands.
    const y = h * Math.pow(random(), 2.2) * 0.75;
    const maxR = (compact ? 2.6 : 3.4) + random() * (compact ? 1.6 : 2.6);
    return {
      x: random() * w,
      y,
      startY: y,
      r: anywhere ? random() * maxR : 0.6,
      maxR,
      v: 0,
      phase: random() * 6,
      state: 'grow',
      alpha: 1,
    };
  };
  return {
    resize(width, height) {
      w = width;
      h = height;
      const n = compact ? 5 : Math.max(10, Math.min(22, Math.round((w * h) / 9000)));
      beads = Array.from({ length: n }, () => born(true));
      mist = Array.from({ length: compact ? 14 : 44 }, () => ({
        x: random() * w,
        y: random() * h,
        r: 0.6 + random() * 1,
      }));
    },
    paint(ctx, dt, now) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      for (const m of mist) {
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const b of beads) {
        if (b.state === 'grow') {
          b.r += dt * (0.35 + 0.25 * Math.sin(b.phase));
          if (b.r >= b.maxR) {
            b.state = 'slide';
            b.v = 8;
          }
        } else if (b.state === 'slide') {
          // A drop on glass sticks and lets go: its speed pulses.
          const stick = 0.35 + 0.65 * Math.abs(Math.sin(now / 340 + b.phase));
          b.v = Math.min(150, b.v + dt * 95);
          b.y += b.v * stick * dt;
          b.r = Math.max(1.4, b.r - dt * 0.12);
          if (b.y - b.r > h) b.state = 'fade';
        } else {
          b.alpha -= dt * 1.4;
          if (b.alpha <= 0) Object.assign(b, born(false));
        }
        const a = Math.max(0, b.alpha);
        if (b.state !== 'grow') {
          ctx.strokeStyle = `rgba(255,255,255,${String(0.2 * a)})`;
          ctx.lineWidth = Math.max(1, b.r * 0.55);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(b.x, b.startY);
          ctx.lineTo(b.x, Math.min(b.y, h));
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(255,255,255,${String(0.32 * a)})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${String(0.75 * a)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        // A bright spot at the top left, and a darker edge below, as a lens of water has.
        ctx.fillStyle = `rgba(255,255,255,${String(0.9 * a)})`;
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(0.6, b.r * 0.28), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(70,110,160,${String(0.3 * a)})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.8, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }
    },
  };
}

/** A low flame, bright sparks that fly up and fade, and smoke rising: dark and warm, and not too much. */
function sparksPainter({ random, compact }: Options): Painter {
  let w = 1;
  let h = 1;
  interface Spark {
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    ttl: number;
    r: number;
    phase: number;
  }
  interface Puff {
    x: number;
    y: number;
    age: number;
    ttl: number;
    r: number;
    vx: number;
  }
  interface Tongue {
    x: number;
    wide: number;
    tall: number;
    phase: number;
  }
  let sparks: Spark[] = [];
  let puffs: Puff[] = [];
  let tongues: Tongue[] = [];
  const spark = (anywhere: boolean): Spark => {
    const ttl = 3 + random() * 4.5;
    return {
      x: random() * w,
      y: h - random() * 12,
      vx: (random() - 0.5) * 26,
      vy: -(55 + random() * 130),
      age: anywhere ? random() * ttl : 0,
      ttl,
      r: (compact ? 0.7 : 0.9) + random() * (compact ? 1 : 1.5),
      phase: random() * 6,
    };
  };
  const puff = (anywhere: boolean): Puff => {
    const ttl = 7 + random() * 6;
    return {
      x: random() * w,
      y: h * (0.75 + random() * 0.25),
      age: anywhere ? random() * ttl : 0,
      ttl,
      r: (compact ? 20 : 34) + random() * (compact ? 18 : 40),
      vx: (random() - 0.4) * 8,
    };
  };
  return {
    resize(width, height) {
      w = width;
      h = height;
      sparks = Array.from(
        { length: compact ? 14 : Math.max(26, Math.min(52, Math.round(w / 8))) },
        () => spark(true),
      );
      puffs = Array.from({ length: compact ? 4 : 7 }, () => puff(true));
      const n = Math.max(5, Math.round(w / (compact ? 46 : 62)));
      tongues = Array.from({ length: n }, (_, i) => ({
        x: ((i + 0.5) / n) * w + (random() - 0.5) * 14,
        wide: (w / n) * (1.1 + random() * 0.7),
        tall: h * (compact ? 0.26 : 0.1) * (0.7 + random() * 0.6),
        phase: random() * 6,
      }));
    },
    paint(ctx, dt, now) {
      ctx.clearRect(0, 0, w, h);
      // The glow along the ground.
      const glow = ctx.createLinearGradient(0, h, 0, h * (compact ? 0.4 : 0.6));
      glow.addColorStop(0, 'rgba(255,120,40,0.34)');
      glow.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      // Smoke, first, so the flame and sparks are in front of it.
      for (const p of puffs) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y -= (h / 11) * dt;
        if (p.age > p.ttl) Object.assign(p, puff(false));
        const life = p.age / p.ttl;
        blob(
          ctx,
          p.x,
          p.y,
          p.r * (0.7 + life * 0.9),
          [150, 140, 136],
          0.2 * Math.sin(life * Math.PI),
        );
      }
      // The flame: a row of tongues that flicker.
      for (const t of tongues) {
        const flick =
          0.78 + 0.22 * Math.sin(now / 120 + t.phase) + 0.12 * Math.sin(now / 71 + t.phase * 2);
        const height = t.tall * flick;
        const sway = Math.sin(now / 340 + t.phase) * t.wide * 0.18;
        const g = ctx.createLinearGradient(0, h, 0, h - height);
        g.addColorStop(0, 'rgba(255,214,110,0.8)');
        g.addColorStop(0.45, 'rgba(255,128,36,0.62)');
        g.addColorStop(1, 'rgba(200,50,14,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(t.x - t.wide / 2, h + 2);
        ctx.quadraticCurveTo(
          t.x - t.wide * 0.22 + sway * 0.5,
          h - height * 0.55,
          t.x + sway,
          h - height,
        );
        ctx.quadraticCurveTo(
          t.x + t.wide * 0.22 + sway * 0.5,
          h - height * 0.5,
          t.x + t.wide / 2,
          h + 2,
        );
        ctx.closePath();
        ctx.fill();
      }
      // Sparks: bright, drifting a little as they climb, going from yellow to orange to nothing.
      for (const s of sparks) {
        s.age += dt;
        if (s.age > s.ttl) Object.assign(s, spark(false));
        s.x += (s.vx + Math.sin(now / 420 + s.phase) * 14) * dt;
        s.y += s.vy * dt;
        const life = s.age / s.ttl;
        const a = Math.min(1, (1 - life) * 1.7);
        const green = Math.round(220 - life * 110);
        const blue = Math.round(120 - life * 90);
        const flicker = 0.75 + 0.25 * Math.sin(now / 60 + s.phase * 3);
        blob(ctx, s.x, s.y, s.r * 4.2, [255, green, blue], 0.34 * a * flicker);
        ctx.fillStyle = `rgba(255,${String(Math.min(255, green + 30))},${String(blue + 30)},${String(a * flicker)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}

/** Streaks of wind that wave along, and a few leaves and specks of dust carried on them. */
function windPainter({ random, compact }: Options): Painter {
  let w = 1;
  let h = 1;
  interface Streak {
    head: number;
    y: number;
    speed: number;
    len: number;
    amp: number;
    freq: number;
    phase: number;
    width: number;
    alpha: number;
  }
  interface Leaf {
    x: number;
    y: number;
    speed: number;
    size: number;
    spin: number;
    phase: number;
    colour: Rgb;
  }
  let streaks: Streak[] = [];
  let leaves: Leaf[] = [];
  const leaf = (anywhere: boolean): Leaf => ({
    x: anywhere ? random() * w : -10,
    y: random() * h,
    speed: 70 + random() * 150,
    size: 3 + random() * 3,
    spin: 1 + random() * 3,
    phase: random() * 6,
    colour: random() > 0.5 ? [106, 150, 96] : [176, 146, 104],
  });
  return {
    resize(width, height) {
      w = width;
      h = height;
      streaks = Array.from({ length: compact ? 7 : 15 }, () => ({
        head: random() * (w + 200),
        y: random() * h,
        speed: 90 + random() * 170,
        len: 70 + random() * 120,
        amp: 3 + random() * 11,
        freq: 0.012 + random() * 0.02,
        phase: random() * 6,
        width: 1 + random() * 1.4,
        alpha: 0.35 + random() * 0.45,
      }));
      leaves = Array.from({ length: compact ? 4 : 11 }, () => leaf(true));
    },
    paint(ctx, dt, now) {
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      for (const s of streaks) {
        s.head += s.speed * dt;
        if (s.head - s.len > w) {
          s.head = -10;
          s.y = random() * h;
        }
        const steps = 10;
        for (let i = 0; i < steps; i++) {
          const t0 = i / steps;
          const t1 = (i + 1) / steps;
          const x0 = s.head - t0 * s.len;
          const x1 = s.head - t1 * s.len;
          ctx.strokeStyle = `rgba(70,150,165,${String(s.alpha * 0.7 * (1 - t0))})`;
          ctx.lineWidth = s.width;
          ctx.beginPath();
          ctx.moveTo(x0, s.y + Math.sin(x0 * s.freq + s.phase + now / 700) * s.amp);
          ctx.lineTo(x1, s.y + Math.sin(x1 * s.freq + s.phase + now / 700) * s.amp);
          ctx.stroke();
        }
      }
      for (const l of leaves) {
        l.x += l.speed * dt;
        if (l.x > w + 12) Object.assign(l, leaf(false));
        const y = l.y + Math.sin(now / 520 + l.phase) * 10;
        ctx.save();
        ctx.translate(l.x, y);
        ctx.rotate((now / 1000) * l.spin + l.phase);
        ctx.fillStyle = rgba(l.colour, 0.75);
        ctx.beginPath();
        ctx.ellipse(0, 0, l.size, l.size * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },
  };
}

/** Haze that drifts and specks hanging in it: for a smog day (a dim sun behind), and for a GRAP stage in its colour. */
function hazePainter({ random, compact, tint, stage }: Options, grap: boolean): Painter {
  let w = 1;
  let h = 1;
  interface Speck {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    phase: number;
  }
  let specks: Speck[] = [];
  return {
    resize(width, height) {
      w = width;
      h = height;
      const count = grap ? (compact ? 10 : 14 + stage * 11) : compact ? 18 : 70;
      specks = Array.from({ length: count }, () => ({
        x: random() * w,
        y: random() * h,
        vx: (random() - 0.4) * 14,
        vy: (random() - 0.5) * 8,
        r: (compact ? 1 : 1.2) + random() * (grap ? 3.2 : 2.2),
        phase: random() * Math.PI * 2,
      }));
    },
    paint(ctx, dt, now) {
      ctx.clearRect(0, 0, w, h);
      if (!grap) {
        // A dim sun, high up, with the haze in front of it.
        blob(ctx, w * 0.78, Math.min(h * 0.2, 60), compact ? 36 : 90, [255, 226, 170], 0.5);
        blob(ctx, w * 0.78, Math.min(h * 0.2, 60), compact ? 12 : 26, [255, 244, 214], 0.7);
      }
      const veil = ctx.createLinearGradient(0, 0, 0, h);
      veil.addColorStop(0, rgba(tint, grap ? 0.2 : 0.3));
      veil.addColorStop(1, rgba(tint, 0.06));
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < (compact ? 3 : 5); i++) {
        const cx = ((now / 40 + i * 190) % (w + 320)) - 160;
        const cy = h * (0.2 + 0.16 * i) + Math.sin(now / 2600 + i) * 14;
        blob(ctx, cx, cy, compact ? 80 : 150, tint, 0.26);
      }
      for (const s of specks) {
        s.x += (s.vx + Math.sin(now / 1700 + s.phase) * 5) * dt;
        s.y += (s.vy + Math.cos(now / 2100 + s.phase) * 4) * dt;
        if (s.x < -10) s.x = w + 10;
        if (s.x > w + 10) s.x = -10;
        if (s.y < -10) s.y = h + 10;
        if (s.y > h + 10) s.y = -10;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        if (grap) {
          // As in the AIR Lens: a coloured speck with a dark outline.
          ctx.fillStyle = rgba(tint, 0.85);
          ctx.fill();
          ctx.strokeStyle = 'rgba(40,40,50,0.45)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(96,84,74,0.5)';
          ctx.fill();
        }
      }
    },
  };
}

const PAINTERS: Readonly<Record<ParticleKind, (options: Options) => Painter>> = {
  rain: rainPainter,
  drip: dripPainter,
  sparks: sparksPainter,
  wind: windPainter,
  smog: (options) => hazePainter(options, false),
  grap: (options) => hazePainter(options, true),
};

/**
 * A moving picture behind an alert, in the spirit of a weather app: rain falling from dark clouds, haze and a dim sun
 * for smog, a low flame with sparks and smoke for burning, wind with leaves, and for a GRAP stage the same specks as
 * the AIR Lens in the colour of its level. It stays still for people who ask for less motion, and never takes a tap.
 */
export function AirParticles({
  kind,
  stage = 1,
  tint = [140, 120, 100],
  compact = false,
}: {
  readonly kind: ParticleKind;
  readonly stage?: number;
  /** The colour of the haze or specks, for `smog` and `grap`. */
  readonly tint?: Rgb;
  readonly compact?: boolean;
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tr, tg, tb] = tint;

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
    const painter = PAINTERS[kind]({
      random: seeded(kind.length * 7919 + stage * 31 + (compact ? 5 : 0)),
      compact,
      tint: [tr, tg, tb],
      stage,
    });
    let frame = 0;
    let last = performance.now();

    const resize = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      draw.setTransform(dpr, 0, 0, dpr, 0, 0);
      painter.resize(w, h);
      if (reduced) painter.paint(draw, 0.016, 0);
    };

    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      painter.paint(draw, dt, now);
      frame = window.requestAnimationFrame(tick);
    };

    resize();
    const watcher = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
    watcher?.observe(el);
    if (!reduced) frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      watcher?.disconnect();
    };
  }, [kind, stage, compact, tr, tg, tb]);

  return <canvas ref={canvas} className="air-particles" aria-hidden="true" data-kind={kind} />;
}
