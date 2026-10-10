import { describe, expect, it } from 'vitest';
import { makeProvenance } from './provenance';
import { roomVerdict, type VerdictInput } from './verdict';

const ASOF = '2025-12-10T10:00:00.000Z';
const prov = makeProvenance({
  mode: 'live',
  source: 'unit',
  asOf: ASOF,
  observedAt: '2025-12-10T09:59:00.000Z',
});
const healthy: VerdictInput = {
  roomId: 'r1',
  asOf: ASOF,
  insidePm25: 90,
  insideAgeMinutes: 1,
  rhPct: 50,
  outsidePm25: 250,
  outsideAgeMinutes: 30,
  lastSeenMinutes: 0.5,
};
const verdictFor = (change: Partial<VerdictInput> = {}): ReturnType<typeof roomVerdict> =>
  roomVerdict({ ...healthy, ...change }, prov);

describe('room verdict', () => {
  it('64% cleaner is "working well"', () => {
    const result = verdictFor();
    expect(result.verdict).toBe('working_well');
    expect(result.cleanerThanOutsidePct).toBeCloseTo(64, 6);
  });

  it('40% is "helping a bit" and 20% is "not working"', () => {
    expect(verdictFor({ insidePm25: 150 }).verdict).toBe('helping_a_bit');
    expect(verdictFor({ insidePm25: 200 }).verdict).toBe('not_working');
  });

  it('treats 50 and 30 as inclusive thresholds', () => {
    expect(verdictFor({ insidePm25: 125 }).verdict).toBe('working_well');
    expect(verdictFor({ insidePm25: 175 }).verdict).toBe('helping_a_bit');
  });

  it('rule I4: not sure when outside is under 100', () => {
    const result = verdictFor({ outsidePm25: 60, insidePm25: 20 });
    expect(result.verdict).toBe('not_sure');
    expect(result.reasons).toContain('too_clean_to_judge');
    expect(result.cleanerThanOutsidePct).toBeNull();
  });

  it('rule I4: not sure in damp air', () => {
    expect(verdictFor({ rhPct: 85 }).reasons).toContain('damp_air');
  });

  it('rule I4: not sure when readings are stale', () => {
    expect(verdictFor({ insideAgeMinutes: 11 }).reasons).toContain('stale_inside');
    expect(verdictFor({ outsideAgeMinutes: 181 }).reasons).toContain('stale_outside');
  });

  it('rule I4: not sure when two sensors disagree by more than 25%', () => {
    expect(verdictFor({ secondInsidePm25: 150 }).reasons).toContain('sensors_disagree');
    expect(verdictFor({ secondInsidePm25: 95 }).verdict).toBe('working_well');
  });

  it('is not sure when the unit is offline or there is no outdoor reference', () => {
    expect(verdictFor({ lastSeenMinutes: 5 }).reasons).toContain('offline');
    expect(verdictFor({ outsidePm25: null, outsideAgeMinutes: null }).reasons).toContain(
      'no_outdoor_reference',
    );
  });

  it('collects every reason, not just the first', () => {
    const result = verdictFor({ rhPct: 90, outsidePm25: 50, insideAgeMinutes: 30 });
    expect(result.reasons).toEqual(
      expect.arrayContaining(['damp_air', 'too_clean_to_judge', 'stale_inside']),
    );
  });

  it('carries provenance (rule I2) and the expected value when given', () => {
    const result = verdictFor({ expectedPct: 48 });
    expect(result.prov.label).toBe('Your room');
    expect(result.expectedPct).toBe(48);
  });
});
