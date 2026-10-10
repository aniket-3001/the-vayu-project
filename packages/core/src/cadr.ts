/**
 * CADR from a smoke-decay test: `CADR = V * (k_on - k_off)`, with each `k` fitted from
 * `ln(C - background)` against time.
 */

export interface DecaySample {
  /** Minutes since the start of the run. */
  readonly tMin: number;
  readonly value: number;
}

export type InvalidReason = 'no_peak' | 'too_few_samples' | 'no_decay' | 'poor_fit';

/** A fit is either valid, with its rate and quality, or invalid, with the reason. */
export type DecayFit =
  | {
      readonly kind: 'valid';
      readonly kPerHour: number;
      readonly standardError: number;
      readonly r2: number;
      readonly samples: number;
    }
  | { readonly kind: 'invalid'; readonly reason: InvalidReason; readonly samples: number };

export interface FitOptions {
  readonly mixingMinutes?: number;
  readonly endFraction?: number;
  readonly maxMinutes?: number;
  readonly minSamples?: number;
  readonly minR2?: number;
}

const invalid = (reason: InvalidReason, samples = 0): DecayFit => ({
  kind: 'invalid',
  reason,
  samples,
});

/**
 * Fits the exponential tail of one run. It starts `mixingMinutes` after the peak (the room needs
 * time to mix) and stops when the excess falls to `endFraction` of the peak or after
 * `maxMinutes`. A run is valid only with enough samples and R2 at or above `minR2` (rule I13).
 */
export function fitDecay(
  samples: readonly DecaySample[],
  background: number,
  options: FitOptions = {},
): DecayFit {
  const mixingMinutes = options.mixingMinutes ?? 2;
  const endFraction = options.endFraction ?? 0.1;
  const maxMinutes = options.maxMinutes ?? 30;
  const minSamples = options.minSamples ?? 10;
  const minR2 = options.minR2 ?? 0.95;

  const peak = samples.reduce<DecaySample | undefined>(
    (top, sample) => (top === undefined || sample.value > top.value ? sample : top),
    undefined,
  );
  if (peak === undefined || peak.value - background <= 0) return invalid('no_peak');
  const peakExcess = peak.value - background;

  const points: { x: number; y: number }[] = [];
  for (const sample of samples) {
    if (sample.tMin < peak.tMin + mixingMinutes || sample.tMin > peak.tMin + maxMinutes) continue;
    const excess = sample.value - background;
    if (excess <= endFraction * peakExcess) break;
    points.push({ x: sample.tMin / 60, y: Math.log(excess) });
  }
  if (points.length < minSamples) return invalid('too_few_samples', points.length);

  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  const sxx = points.reduce((sum, p) => sum + (p.x - meanX) ** 2, 0);
  const sxy = points.reduce((sum, p) => sum + (p.x - meanX) * (p.y - meanY), 0);
  const syy = points.reduce((sum, p) => sum + (p.y - meanY) ** 2, 0);
  if (sxx === 0) return invalid('no_decay', n);

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const sse = points.reduce((sum, p) => sum + (p.y - (intercept + slope * p.x)) ** 2, 0);
  const standardError = Math.sqrt(sse / Math.max(1, n - 2) / sxx);
  const r2 = syy === 0 ? 0 : 1 - sse / syy;
  const kPerHour = -slope;
  if (kPerHour <= 0) return invalid('no_decay', n);
  if (r2 < minR2) return invalid('poor_fit', n);
  return { kind: 'valid', kPerHour, standardError, r2, samples: n };
}

export type CadrOutcome =
  | {
      readonly kind: 'cadr';
      readonly cadrM3h: number;
      readonly ci95: readonly [number, number];
      readonly kOn: number;
      readonly kOff: number;
      readonly usedRuns: { readonly baseline: number; readonly on: number };
    }
  | {
      readonly kind: 'none';
      readonly reason: 'no_valid_baseline' | 'no_valid_on_run' | 'no_speedup';
    };

type ValidFit = Extract<DecayFit, { kind: 'valid' }>;
const validOnly = (fits: readonly DecayFit[]): ValidFit[] =>
  fits.filter((fit): fit is ValidFit => fit.kind === 'valid');
const average = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const errorOfMean = (fits: readonly ValidFit[]): number =>
  Math.sqrt(fits.reduce((sum, fit) => sum + fit.standardError ** 2, 0)) / fits.length;

/**
 * Combines valid runs into one CADR with a 95% interval. There is no CADR unless there is at
 * least one valid run of each kind and the cleaner sped decay up by more than the fit's own
 * uncertainty.
 */
export function cadrFromRuns(
  baselineRuns: readonly DecayFit[],
  onRuns: readonly DecayFit[],
  volumeM3: number,
  volumeRelativeUncertainty = 0.05,
): CadrOutcome {
  const baseline = validOnly(baselineRuns);
  const on = validOnly(onRuns);
  if (baseline.length === 0) return { kind: 'none', reason: 'no_valid_baseline' };
  if (on.length === 0) return { kind: 'none', reason: 'no_valid_on_run' };

  const kOff = average(baseline.map((fit) => fit.kPerHour));
  const kOn = average(on.map((fit) => fit.kPerHour));
  const rateError = Math.hypot(errorOfMean(baseline), errorOfMean(on));
  if (kOn - kOff <= 1.96 * rateError) return { kind: 'none', reason: 'no_speedup' };

  const cadrM3h = volumeM3 * (kOn - kOff);
  const half = 1.96 * Math.hypot(volumeM3 * rateError, cadrM3h * volumeRelativeUncertainty);
  return {
    kind: 'cadr',
    cadrM3h,
    ci95: [cadrM3h - half, cadrM3h + half],
    kOn,
    kOff,
    usedRuns: { baseline: baseline.length, on: on.length },
  };
}
