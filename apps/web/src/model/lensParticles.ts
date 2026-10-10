import { rules, type Band } from '@vayu/contracts';
import { clamp, seededRandom } from '@vayu/core';

/** One speck, in a canvas-size-independent 0..1 coordinate space. */
export interface Particle {
  readonly xFrac: number;
  readonly yFrac: number;
  readonly radiusPx: number;
  readonly driftXFrac: number;
  readonly driftYFrac: number;
}

/** The midpoint of a band's CPCB PM2.5 breakpoint range — a stand-in severity for "just a band". */
export function representativePm25(band: Band): number {
  const row = rules.cpcb.pm25.find((candidate) => candidate.band === band);
  if (!row) {
    throw new Error(`no CPCB PM2.5 breakpoint row for band ${band}`);
  }
  return (row.bpLo + row.bpHi) / 2;
}

/** More pollution, more specks — capped so "severe" is dense but never opaque (it's an illustration). */
export function particleCountFor(band: Band): number {
  return clamp(Math.round(representativePm25(band) * 1.2), 10, 400);
}

/**
 * A deterministic speck layout for a band: the same band and seed always draw the same frame-0
 * positions, so the illustration is reproducible in a screenshot or a test.
 */
export function layoutParticles(band: Band, seed = 1): readonly Particle[] {
  const random = seededRandom(seed);
  return Array.from({ length: particleCountFor(band) }, () => ({
    xFrac: random(),
    yFrac: random(),
    radiusPx: 0.8 + random() * 1.6,
    driftXFrac: (random() - 0.5) * 0.002,
    driftYFrac: 0.001 + random() * 0.0015,
  }));
}

/** Moves every particle one tick along its drift, wrapping around the frame. */
export function stepParticles(particles: readonly Particle[]): readonly Particle[] {
  return particles.map((particle) => ({
    ...particle,
    xFrac: wrap(particle.xFrac + particle.driftXFrac),
    yFrac: wrap(particle.yFrac + particle.driftYFrac),
  }));
}

function wrap(fraction: number): number {
  const wrapped = fraction % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}
