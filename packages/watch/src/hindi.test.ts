import type { Alert } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { hindiVoiceText } from './hindi';
import { numbersMatchFacts } from './phrase';

const alert = (over: Partial<Alert> = {}): Alert => ({
  schemaVersion: 1,
  id: 'a1',
  ruleId: 'rule-grap-early-warning',
  audience: { groupId: 'school-demo', role: 'principal' },
  title: 'GRAP Stage IV likely tomorrow',
  body: 'Forecast AQI crosses the official Stage IV threshold.',
  facts: { aqi: 410 },
  createdAt: '2026-10-08T10:00:00.000Z',
  mode: 'live',
  unofficial: true,
  actions: ['seen'],
  policyId: 'policy_school_grap',
  ...over,
});

describe('hindiVoiceText', () => {
  it('says the heads-up in Hindi, with the AQI from the facts, and that it is our estimate, not an order', () => {
    const text = hindiVoiceText(alert()) ?? '';
    expect(text).toContain('410');
    expect(text).toContain('जी आर ए पी चरण चार');
    expect(text).toContain('आधिकारिक आदेश नहीं');
  });

  it('rule I6: every number in the voice text is a number in the facts', () => {
    for (const aqi of [410, 285, 450.5]) {
      const a = alert({ facts: { aqi } });
      expect(numbersMatchFacts(hindiVoiceText(a) ?? '', a.facts)).toBe(true);
    }
  });

  it('says it is a reminder, or an escalation, so it is not mistaken for the first message', () => {
    expect(hindiVoiceText(alert(), 'remind')).toMatch(/^अनुस्मारक/);
    expect(hindiVoiceText(alert(), 'escalate')).toMatch(/^आगे बढ़ाई गई सूचना/);
    expect(hindiVoiceText(alert(), 'send')).toMatch(/^सूचना/);
  });

  it('rule I17: a replay says it is a replay before anything else', () => {
    expect(hindiVoiceText(alert({ mode: 'replay' }))).toMatch(/^यह रीप्ले है, असली चेतावनी नहीं/);
  });

  it('says nothing, rather than guess, for an alert it has no Hindi wording for', () => {
    expect(hindiVoiceText(alert({ ruleId: 'rule-something-new' }))).toBeUndefined();
  });

  it('says nothing when the number it needs is missing or not a number', () => {
    expect(hindiVoiceText(alert({ facts: {} }))).toBeUndefined();
    expect(hindiVoiceText(alert({ facts: { aqi: 'high' } }))).toBeUndefined();
    expect(hindiVoiceText(alert({ facts: { aqi: -5 } }))).toBeUndefined();
  });

  it('is plain Hindi and digits, short enough for one voice note', () => {
    const text = hindiVoiceText(alert({ mode: 'replay' }), 'escalate') ?? '';
    expect(text).toMatch(/^[ऀ-ॿ0-9\s।,.]+$/);
    expect(text.length).toBeLessThan(600);
  });
});
