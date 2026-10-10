import { rules, type RoomVerdict } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { fixOutcome } from './fixcheck';

const verdict = (
  v: RoomVerdict['verdict'],
  pct: number | null = 60,
): Pick<RoomVerdict, 'verdict' | 'cleanerThanOutsidePct'> => ({
  verdict: v,
  cleanerThanOutsidePct: pct,
});

describe('fixOutcome', () => {
  it('is improved when the room fell by enough and is now clearly cleaner than outside', () => {
    expect(
      fixOutcome({ baselinePm25: 200, insidePm25: 100, verdict: verdict('working_well') }),
    ).toEqual({
      outcome: 'improved',
      dropPct: 50,
    });
  });

  it('is not improved when the room fell less than the rule asks', () => {
    const justUnder = 200 * (1 - (rules.fixCheck.minDropPct - 1) / 100);
    expect(
      fixOutcome({ baselinePm25: 200, insidePm25: justUnder, verdict: verdict('working_well') })
        .outcome,
    ).toBe('not_improved');
  });

  it('is improved at exactly the minimum drop', () => {
    const exactly = 200 * (1 - rules.fixCheck.minDropPct / 100);
    expect(
      fixOutcome({ baselinePm25: 200, insidePm25: exactly, verdict: verdict('helping_a_bit') })
        .outcome,
    ).toBe('improved');
  });

  it('is not improved when the room fell but is still worse than outside (the verdict says not working)', () => {
    expect(
      fixOutcome({ baselinePm25: 400, insidePm25: 250, verdict: verdict('not_working', -10) }),
    ).toMatchObject({
      outcome: 'not_improved',
    });
  });

  it('is not improved when the room got worse', () => {
    expect(
      fixOutcome({ baselinePm25: 100, insidePm25: 150, verdict: verdict('not_working', -5) }),
    ).toEqual({
      outcome: 'not_improved',
      dropPct: -50,
    });
  });

  it('is not sure whenever the verdict refuses to judge, never a guess', () => {
    expect(
      fixOutcome({ baselinePm25: 200, insidePm25: 100, verdict: verdict('not_sure', null) }),
    ).toEqual({
      outcome: 'not_sure',
      dropPct: 50,
    });
  });

  it('is not sure, with no drop, when either end is unknown', () => {
    expect(
      fixOutcome({ baselinePm25: null, insidePm25: 100, verdict: verdict('working_well') }),
    ).toEqual({ outcome: 'not_sure', dropPct: null });
    expect(
      fixOutcome({ baselinePm25: 200, insidePm25: null, verdict: verdict('working_well') }),
    ).toEqual({ outcome: 'not_sure', dropPct: null });
  });

  it('is not sure when the baseline is zero (a drop from nothing means nothing)', () => {
    expect(
      fixOutcome({ baselinePm25: 0, insidePm25: 0, verdict: verdict('working_well') }),
    ).toEqual({ outcome: 'not_sure', dropPct: null });
  });
});
