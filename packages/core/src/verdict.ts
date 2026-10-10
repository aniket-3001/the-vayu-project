import {
  rules,
  type Provenance,
  type Reason,
  type RoomVerdict,
  type Verdict,
} from '@vayu/contracts';

export interface VerdictInput {
  readonly roomId: string;
  readonly asOf: string;
  /** The median of the unit's PM2.5 over the last 30 minutes. */
  readonly insidePm25: number | null;
  readonly insideAgeMinutes: number | null;
  readonly rhPct?: number | null;
  /** The latest validated outdoor value, from a station or our own outdoor node. */
  readonly outsidePm25: number | null;
  readonly outsideAgeMinutes: number | null;
  /** A second sensor in the same room, if there is one. */
  readonly secondInsidePm25?: number | null;
  /** Minutes since the unit last reported. */
  readonly lastSeenMinutes: number | null;
  readonly expectedPct?: number;
}

type VerdictRules = typeof rules.verdict;

function reasonsToDoubt(input: VerdictInput, limits: VerdictRules): Reason[] {
  const reasons: Reason[] = [];
  if (input.lastSeenMinutes === null || input.lastSeenMinutes > limits.offlineAfterMin) {
    reasons.push('offline');
  }
  if (input.insidePm25 === null) reasons.push('no_inside_reading');
  else if (input.insideAgeMinutes === null || input.insideAgeMinutes > limits.maxInsideAgeMin) {
    reasons.push('stale_inside');
  }
  if (input.outsidePm25 === null) reasons.push('no_outdoor_reference');
  else if (input.outsideAgeMinutes === null || input.outsideAgeMinutes > limits.maxOutsideAgeMin) {
    reasons.push('stale_outside');
  }
  if (input.rhPct !== undefined && input.rhPct !== null && input.rhPct >= limits.maxRhPct) {
    reasons.push('damp_air');
  }
  if (input.outsidePm25 !== null && input.outsidePm25 < limits.minOutsidePm25) {
    reasons.push('too_clean_to_judge');
  }
  const second = input.secondInsidePm25;
  if (input.insidePm25 !== null && second !== undefined && second !== null) {
    const average = (input.insidePm25 + second) / 2;
    if (
      average > 0 &&
      (Math.abs(input.insidePm25 - second) / average) * 100 > limits.maxDisagreePct
    ) {
      reasons.push('sensors_disagree');
    }
  }
  return reasons;
}

function classify(percent: number, limits: VerdictRules): Verdict {
  if (percent >= limits.workingWellPct) return 'working_well';
  if (percent >= limits.redBelowPct) return 'helping_a_bit';
  return 'not_working';
}

/**
 * "Cleaner than outside by X%". It refuses to judge, saying why, whenever the number could
 * mislead (rule I4): outside too clean for the sensor's error, damp air, stale readings,
 * sensors that disagree, or an offline unit. The thresholds are hypotheses held as data.
 */
export function roomVerdict(
  input: VerdictInput,
  prov: Provenance,
  limits: VerdictRules = rules.verdict,
): RoomVerdict {
  const reasons = reasonsToDoubt(input, limits);
  const percent =
    reasons.length === 0 && input.insidePm25 !== null && input.outsidePm25 !== null
      ? ((input.outsidePm25 - input.insidePm25) / input.outsidePm25) * 100
      : null;
  return {
    schemaVersion: 1,
    roomId: input.roomId,
    asOf: input.asOf,
    cleanerThanOutsidePct: percent,
    insidePm25: input.insidePm25,
    outsidePm25: input.outsidePm25,
    ...(input.expectedPct === undefined ? {} : { expectedPct: input.expectedPct }),
    verdict: percent === null ? 'not_sure' : classify(percent, limits),
    reasons,
    prov,
  };
}
