import { describe, expect, it } from 'vitest';
import { cadrFromRuns, fitDecay, type DecaySample } from './cadr';
import { seededRandom } from './stats';

interface RunShape {
  readonly peak?: number;
  readonly background?: number;
  readonly noise?: number;
  readonly minutes?: number;
  readonly seed?: number;
}

/** A synthetic smoke run: C(t) = bg + (peak - bg) * exp(-k t), every 10 s, with multiplicative noise. */
function syntheticRun(kPerHour: number, shape: RunShape = {}): DecaySample[] {
  const { peak = 500, background = 20, noise = 0.01, minutes = 90, seed = 1 } = shape;
  const random = seededRandom(seed);
  return Array.from({ length: minutes * 6 + 1 }, (_, index) => {
    const seconds = index * 10;
    const clean = background + (peak - background) * Math.exp((-kPerHour * seconds) / 3600);
    return { tMin: seconds / 60, value: clean * (1 + (random() - 0.5) * 2 * noise) };
  });
}

const baselineFit = (seed: number, noise = 0.01): ReturnType<typeof fitDecay> =>
  fitDecay(syntheticRun(0.4, { seed, noise }), 20, { maxMinutes: 60 });
const onFit = (seed: number): ReturnType<typeof fitDecay> =>
  fitDecay(syntheticRun(10.4, { seed }), 20);

describe('CADR from decay (rule I13)', () => {
  it('recovers the test vector (V=40, k_off=0.4, CADR=400) within 5%', () => {
    const outcome = cadrFromRuns([baselineFit(3)], [onFit(4)], 40);
    expect(outcome.kind).toBe('cadr');
    if (outcome.kind !== 'cadr') return;
    expect(Math.abs(outcome.cadrM3h - 400) / 400).toBeLessThan(0.05);
    expect(outcome.ci95[0]).toBeLessThan(outcome.cadrM3h);
    expect(outcome.ci95[1]).toBeGreaterThan(outcome.cadrM3h);
  });

  it('averages several runs', () => {
    const outcome = cadrFromRuns(
      [1, 2, 3].map((s) => baselineFit(s)),
      [4, 5, 6].map(onFit),
      40,
    );
    if (outcome.kind !== 'cadr') throw new Error('expected a CADR');
    expect(outcome.usedRuns).toEqual({ baseline: 3, on: 3 });
    expect(Math.abs(outcome.cadrM3h - 400) / 400).toBeLessThan(0.03);
  });

  it('rejects a noisy run (R2 below 0.95)', () => {
    expect(baselineFit(9, 0.25)).toMatchObject({ kind: 'invalid', reason: 'poor_fit' });
  });

  it('rejects a run that is too short', () => {
    expect(fitDecay(syntheticRun(10.4, { minutes: 3 }), 20)).toMatchObject({
      reason: 'too_few_samples',
    });
  });

  it('rejects a run with no peak above background', () => {
    const flat = Array.from({ length: 60 }, (_, minute) => ({ tMin: minute, value: 15 }));
    expect(fitDecay(flat, 20)).toMatchObject({ reason: 'no_peak' });
    expect(fitDecay([], 20)).toMatchObject({ reason: 'no_peak' });
  });

  it('reports no CADR when the cleaner did not speed decay up', () => {
    const a = fitDecay(syntheticRun(0.5), 20, { maxMinutes: 60 });
    const b = fitDecay(syntheticRun(0.5, { seed: 8 }), 20, { maxMinutes: 60 });
    expect(cadrFromRuns([a], [b], 40)).toEqual({ kind: 'none', reason: 'no_speedup' });
  });

  it('needs one valid run of each kind', () => {
    const noisy = baselineFit(1, 0.3);
    expect(cadrFromRuns([noisy], [onFit(2)], 40)).toEqual({
      kind: 'none',
      reason: 'no_valid_baseline',
    });
    expect(cadrFromRuns([baselineFit(1)], [], 40)).toEqual({
      kind: 'none',
      reason: 'no_valid_on_run',
    });
  });

  it('cannot fit a slow baseline in 30 minutes, which is why the baseline run lasts 60', () => {
    // A roadblock found by this test.
    const thirty = fitDecay(syntheticRun(0.4, { noise: 0.03, seed: 3 }), 20, { maxMinutes: 30 });
    const sixty = fitDecay(syntheticRun(0.4, { noise: 0.01, seed: 3 }), 20, { maxMinutes: 60 });
    expect(thirty.kind).toBe('invalid');
    expect(sixty.kind).toBe('valid');
  });
});
