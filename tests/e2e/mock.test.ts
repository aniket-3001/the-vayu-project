import { Today } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { todayAnswer } from './mock';

// The browser tests fake our API. If the fake drifted from the real contract they would test nothing, so it is checked here.
describe("the browser tests' fake API answer", () => {
  it('is a valid /v1/today answer', () => {
    expect(() => Today.parse(todayAnswer())).not.toThrow();
  });
  it('has the monitor the tests look for, and observed hours up to now', () => {
    const answer = Today.parse(todayAnswer(Date.UTC(2026, 10, 4, 6, 20)));
    expect(answer.prov.stationName).toBe('Test Monitor');
    const observed = answer.hours.filter((h) => h.kind === 'observed');
    expect(observed.length).toBeGreaterThan(40);
    expect(answer.hours.some((h) => h.kind === 'forecast')).toBe(true);
  });
});
