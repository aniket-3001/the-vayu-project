import { describe, expect, it } from 'vitest';
import { sampleDay } from '../today/sample';
import { HEAVY_FIRES, alertsFor, dayWord, onDay, suggestionFrom } from './model';

describe('alerts for the next three days', () => {
  it('say GRAP is likely and to avoid park walks on a smog day, today, and call it unofficial', () => {
    const alerts = alertsFor(sampleDay('hazardous'), undefined);
    const grap = alerts.find((a) => a.kind === 'grap');
    expect(grap?.title).toBe('GRAP Stage IV likely today');
    expect(grap?.body).toMatch(/Unofficial/u);
    expect(alerts.find((a) => a.kind === 'walk')?.title).toBe('Avoid park walks today');
    expect(alerts.every((a) => a.day === 0 || a.kind !== 'grap')).toBe(true);
  });

  it('has nothing to say on a clean day', () => {
    expect(alertsFor(sampleDay('good'), undefined)).toEqual([]);
    expect(alertsFor(sampleDay('moderate'), 3)).toEqual([]);
  });

  it('warns about smog in the next two days only when it is bad and clearly worse than today', () => {
    const rainy = alertsFor(sampleDay('rainy'), undefined);
    const smog = rainy.filter((a) => a.kind === 'smog');
    expect(smog.length).toBeGreaterThanOrEqual(0);
    for (const a of smog) {
      expect(a.day).toBeGreaterThan(0);
      expect(a.title).toMatch(/^Smog likely (tomorrow|[A-Z][a-z]+)$/u);
    }
    expect(alertsFor(sampleDay('unhealthy'), undefined).some((a) => a.kind === 'smog')).toBe(false);
  });

  it('raises a stubble alert, with a way to reach the authorities, once the fire count is heavy', () => {
    const heavy = alertsFor(sampleDay('good'), HEAVY_FIRES);
    const stubble = heavy.find((a) => a.kind === 'stubble');
    expect(stubble?.authorities).toBe(true);
    expect(stubble?.body).toMatch(/10 fires/u);
    expect(stubble?.reason).toMatch(/within 100 km/u);
    expect(alertsFor(sampleDay('good'), HEAVY_FIRES - 1)).toEqual([]);
    expect(alertsFor(sampleDay('good'), undefined)).toEqual([]);
  });

  it('are worst first, then in date order, and only the stubble one offers the authorities', () => {
    const alerts = alertsFor(sampleDay('hazardous'), 127);
    const rank = (severity: string): number => (severity === 'severe' ? 0 : 1);
    const keys = alerts.map((a) => [rank(a.severity), a.day] as const);
    expect(keys).toEqual([...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
    expect(alerts[0]?.severity).toBe('severe');
    expect(alerts.filter((a) => a.authorities).map((a) => a.kind)).toEqual(['stubble']);
  });

  it('name the day in words', () => {
    const day = sampleDay('good');
    expect(dayWord(0, day)).toBe('Today');
    expect(dayWord(1, day)).toBe('Tomorrow');
    expect(dayWord(2, day)).toMatch(/^[A-Z][a-z]{2}$/u);
  });
});

describe('when the day arrives', () => {
  it('turns tomorrow’s alert into today’s, drops what has passed, and makes a suggestion of it', () => {
    const alerts = alertsFor(sampleDay('hazardous'), 127);
    const tomorrow = onDay(alerts, 1);
    expect(tomorrow.every((a) => a.day <= 1)).toBe(true);
    const stubble = tomorrow.find((a) => a.kind === 'stubble');
    expect(stubble?.day).toBe(0);
    expect(suggestionFrom(stubble ?? alerts[0] ?? ({} as never))).toMatch(/windows shut/u);
    expect(tomorrow.some((a) => a.id === 'grap-today')).toBe(false);
  });

  it('gives no suggestion for an alert that is still ahead', () => {
    const stubble = alertsFor(sampleDay('good'), 127).find((a) => a.kind === 'stubble');
    expect(stubble && suggestionFrom(stubble)).toBeUndefined();
  });
});
