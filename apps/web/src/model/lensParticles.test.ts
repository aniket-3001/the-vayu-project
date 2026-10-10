import type { Band } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import {
  layoutParticles,
  particleCountFor,
  representativePm25,
  stepParticles,
} from './lensParticles';

const BANDS: readonly Band[] = ['good', 'satisfactory', 'moderate', 'poor', 'very_poor', 'severe'];

describe('representativePm25', () => {
  it('increases monotonically from good to severe', () => {
    const values = BANDS.map(representativePm25);
    for (let i = 1; i < values.length; i++) {
      const prev = values[i - 1];
      const curr = values[i];
      if (prev === undefined || curr === undefined) throw new Error('unreachable');
      expect(curr).toBeGreaterThan(prev);
    }
  });
});

describe('particleCountFor', () => {
  it('draws more specks for worse bands, within sane bounds', () => {
    const counts = BANDS.map(particleCountFor);
    for (const count of counts) {
      expect(count).toBeGreaterThanOrEqual(10);
      expect(count).toBeLessThanOrEqual(400);
    }
    for (let i = 1; i < counts.length; i++) {
      const prev = counts[i - 1];
      const curr = counts[i];
      if (prev === undefined || curr === undefined) throw new Error('unreachable');
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});

describe('layoutParticles', () => {
  it('is deterministic: the same band and seed always draw the same frame', () => {
    expect(layoutParticles('poor', 7)).toEqual(layoutParticles('poor', 7));
  });

  it('differs for a different seed', () => {
    expect(layoutParticles('poor', 1)).not.toEqual(layoutParticles('poor', 2));
  });

  it('keeps every speck inside the frame (0..1) and with a positive radius', () => {
    for (const particle of layoutParticles('severe', 3)) {
      expect(particle.xFrac).toBeGreaterThanOrEqual(0);
      expect(particle.xFrac).toBeLessThan(1);
      expect(particle.yFrac).toBeGreaterThanOrEqual(0);
      expect(particle.yFrac).toBeLessThan(1);
      expect(particle.radiusPx).toBeGreaterThan(0);
    }
  });

  it('draws as many specks as the count for that band', () => {
    expect(layoutParticles('good', 1)).toHaveLength(particleCountFor('good'));
  });
});

describe('stepParticles', () => {
  it('moves every particle by its own drift', () => {
    const [before] = layoutParticles('moderate', 5);
    if (before === undefined) throw new Error('expected at least one particle');
    const [after] = stepParticles([before]);
    if (after === undefined) throw new Error('expected at least one particle');
    expect(after.xFrac).toBeCloseTo((before.xFrac + before.driftXFrac + 1) % 1, 6);
    expect(after.yFrac).toBeCloseTo((before.yFrac + before.driftYFrac + 1) % 1, 6);
  });

  it('wraps around the frame instead of drifting off it', () => {
    const particle = {
      xFrac: 0.9995,
      yFrac: 0.9995,
      radiusPx: 1,
      driftXFrac: 0.001,
      driftYFrac: 0.001,
    };
    const [after] = stepParticles([particle]);
    expect(after?.xFrac).toBeLessThan(1);
    expect(after?.xFrac).toBeGreaterThanOrEqual(0);
    expect(after?.yFrac).toBeLessThan(1);
    expect(after?.yFrac).toBeGreaterThanOrEqual(0);
  });
});
