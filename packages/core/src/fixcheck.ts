import { rules, type RoomVerdict } from '@vayu/contracts';

export type FixOutcome = 'improved' | 'not_improved' | 'not_sure';

/**
 * Did the fix work? The room must have fallen by at least the rule's minimum since the start, and
 * the verdict (which compares with the outside air and refuses to judge when it cannot) must say it
 * is now clearly cleaner than outside. Falling is not enough on its own: a room that fell from 400
 * to 250 while outside is 200 has not been fixed. Whenever either end is unknown, or the verdict is
 * "not sure", the answer is "not sure", never a guess.
 */
export function fixOutcome(
  input: {
    readonly baselinePm25: number | null;
    readonly insidePm25: number | null;
    readonly verdict: Pick<RoomVerdict, 'verdict' | 'cleanerThanOutsidePct'>;
  },
  limits: typeof rules.fixCheck = rules.fixCheck,
): { readonly outcome: FixOutcome; readonly dropPct: number | null } {
  const { baselinePm25, insidePm25 } = input;
  if (baselinePm25 === null || insidePm25 === null || baselinePm25 <= 0) {
    return { outcome: 'not_sure', dropPct: null };
  }
  const exactDrop = ((baselinePm25 - insidePm25) / baselinePm25) * 100;
  // The decision uses the exact value; what is reported is rounded to a tenth, as a person would say it.
  const dropPct = Math.round(exactDrop * 10) / 10;
  if (input.verdict.verdict === 'not_sure') return { outcome: 'not_sure', dropPct };
  const clearlyCleaner =
    input.verdict.verdict === 'working_well' || input.verdict.verdict === 'helping_a_bit';
  return {
    outcome: exactDrop >= limits.minDropPct && clearlyCleaner ? 'improved' : 'not_improved',
    dropPct,
  };
}
