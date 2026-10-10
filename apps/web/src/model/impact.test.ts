import { DEMO_PLACES } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { fixtureDataSource } from '../data/fixtureSource';
import { buildTodayModel } from './todayModel';
import { impactOfDoing } from './impact';
import type { Tip } from './todayModel';

/** The sample day is very polluted; a quarter of it has a good afternoon hour. */
const CLEANER_DAY = 0.25;

async function findAdviceTip(): Promise<{ model: ReturnType<typeof buildTodayModel>; tip: Tip }> {
  const source = fixtureDataSource(undefined, CLEANER_DAY);
  for (const place of DEMO_PLACES) {
    const model = buildTodayModel(await source.load(place.id));
    const tip = model.tips.find((candidate) => candidate.search.kind === 'advice');
    if (tip !== undefined) {
      return { model, tip };
    }
  }
  throw new Error('no demo place has an advice window in the fixture data');
}

describe('impactOfDoing', () => {
  it('matches the tip’s own comparison when the suggested window beats the usual hour', async () => {
    const { model, tip } = await findAdviceTip();
    if (tip.search.kind !== 'advice') throw new Error('unreachable');

    const impact = impactOfDoing(model.built.hours, tip.search.window.start);

    expect(impact).not.toBeNull();
    if (tip.search.window.comparison !== undefined) {
      expect(Math.round(impact?.avoidedPct ?? NaN)).toBe(tip.search.window.comparison.lessPct);
    }
  });

  it('is null when the chosen hour is not in the series', async () => {
    const { model } = await findAdviceTip();
    expect(impactOfDoing(model.built.hours, '2099-01-01T00:00:00.000Z')).toBeNull();
  });

  it('is null when the usual hour never appears in the series', () => {
    expect(impactOfDoing([], '2025-12-12T06:00:00.000Z')).toBeNull();
  });
});
