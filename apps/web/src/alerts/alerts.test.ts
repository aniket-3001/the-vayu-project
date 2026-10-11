import { describe, expect, it } from 'vitest';
import { sampleDay } from '../today/sample';
import { HEAVY_FIRES, alertsFor, dayWord, onDay, suggestionFrom } from './model';

describe('alerts for the next three days', () => {
  it('say the air is in a GRAP band on a smog day, today, and call it our estimate', () => {
    const alerts = alertsFor(sampleDay('hazardous'), undefined);
    const grap = alerts.find((a) => a.kind === 'grap');
    expect(grap?.title).toBe('Air here is in the GRAP Stage IV band today');
    expect(grap?.reason).toMatch(
      /our estimate from the monitor nearest this place.*only the official order counts/u,
    );
    expect(alerts.some((a) => (a.kind as string) === 'walk')).toBe(false);
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

  it('has good news too: rain to come says the air should clear, and sorts after the warnings', () => {
    const day = sampleDay('hazardous');
    const rainy = {
      ...day,
      daily: day.daily.map((d, i) =>
        i === 1
          ? {
              ...d,
              aqi: 180,
              sky: {
                ...(d.sky ?? day.daily[0]?.sky),
                rainChancePct: 85,
                condition: 'rain' as const,
              },
            }
          : d,
      ),
    } as typeof day;
    const alerts = alertsFor(rainy, undefined);
    const rain = alerts.find((a) => a.kind === 'rain');
    expect(rain?.severity).toBe('good');
    expect(rain?.title).toBe('Rain tomorrow should clear the air');
    expect(rain?.body).toMatch(/85% chance of rain/u);
    expect(rain?.body).toMatch(/down from/u);
    expect(rain?.avoid).toEqual([]);
    // Warnings first, good news last.
    expect(alerts[alerts.length - 1]?.kind).toBe('rain');
    // Rain with a forecast no cleaner than now is said plainly, not sold as clean air.
    const notCleaner = {
      ...rainy,
      daily: rainy.daily.map((d, i) => (i === 1 ? { ...d, aqi: rainy.aqi + 20 } : d)),
    } as typeof day;
    const honest = alertsFor(notCleaner, undefined).find((a) => a.kind === 'rain');
    expect(honest?.title).toBe('Rain tomorrow');
    expect(honest?.body).toMatch(/no cleaner than now/u);
    expect(honest?.body).not.toMatch(/down from/u);
    // No rain, no rain alert.
    const dry = {
      ...day,
      daily: day.daily.map((d) => ({
        ...d,
        sky:
          d.sky === undefined ? d.sky : { ...d.sky, rainChancePct: 5, condition: 'clear' as const },
      })),
    } as typeof day;
    expect(alertsFor(dry, undefined).some((a) => a.kind === 'rain')).toBe(false);
  });

  it('says rain only when the chance is more than 60%, however the sky is named', () => {
    const day = sampleDay('hazardous');
    const withRain = (pct: number): typeof day => ({
      ...day,
      daily: day.daily.map((d) => ({
        ...d,
        sky:
          d.sky === undefined
            ? d.sky
            : { ...d.sky, rainChancePct: pct, condition: 'rain' as const, windKmh: 3 },
      })),
    });
    for (const pct of [10, 12, 40, 60])
      expect(alertsFor(withRain(pct), undefined).some((a) => a.kind === 'rain')).toBe(false);
    expect(alertsFor(withRain(61), undefined).some((a) => a.kind === 'rain')).toBe(true);
  });
});
