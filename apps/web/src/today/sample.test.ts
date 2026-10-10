import { usAqi } from '@vayu/core';
import { describe, expect, it } from 'vitest';
import { levelForAqi } from '../design/levels';
import { SAMPLE_IDS, SAMPLE_LABELS, sampleDay } from './sample';
import { clock24, hourOfDay, isoDate } from './time';
import type { Condition, TodayData } from './types';

const all = (): TodayData[] => SAMPLE_IDS.map((id) => sampleDay(id));

describe('the sample days', () => {
  it('has six, each with a label for the switcher', () => {
    expect(SAMPLE_IDS).toEqual(['good', 'moderate', 'rainy', 'unhealthy', 'dusty', 'hazardous']);
    for (const id of SAMPLE_IDS) expect(SAMPLE_LABELS[id].length).toBeGreaterThan(3);
  });

  it('between them cover every AQI level, from Good to Hazardous', () => {
    const names = new Set(all().map((day) => levelForAqi(day.aqi).name));
    expect(names.size).toBe(6);
  });

  it('computes every AQI from its PM2.5 with the real US AQI scale, never types one in', () => {
    for (const day of all()) {
      expect(day.aqi).toBe(usAqi(day.pm25)?.value);
      for (const hour of [...day.hourly, ...day.history]) {
        if ('pm25' in hour) expect(hour.aqi).toBe(usAqi(Number(hour.pm25))?.value);
      }
    }
  });

  it('is repeatable: the same day twice is identical', () => {
    for (const id of SAMPLE_IDS) expect(sampleDay(id)).toEqual(sampleDay(id));
  });

  it('describes the same moment in every day, so a switch changes only the air and the sky', () => {
    expect(new Set(all().map((day) => day.asOf)).size).toBe(1);
  });

  it('gives 48 hourly points, an hour apart, starting now', () => {
    for (const day of all()) {
      expect(day.hourly).toHaveLength(48);
      expect(day.hourly[0]?.at).toBe(day.asOf);
      day.hourly.forEach((hour, i) => {
        expect(Date.parse(hour.at) - Date.parse(day.asOf)).toBe(i * 3_600_000);
      });
    }
  });

  it('gives seven days, starting today, one per calendar day in Delhi', () => {
    for (const day of all()) {
      expect(day.daily).toHaveLength(7);
      expect(isoDate(day.daily[0]?.date ?? '')).toBe(isoDate(day.asOf));
      const dates = day.daily.map((d) => isoDate(d.date));
      expect(new Set(dates).size).toBe(7);
    }
  });

  it('gives 48 hours of history, oldest first, ending now', () => {
    for (const day of all()) {
      expect(day.history).toHaveLength(48);
      expect(day.history.at(-1)?.at).toBe(day.asOf);
      expect(
        day.history[0] !== undefined && Date.parse(day.history[0].at) < Date.parse(day.asOf),
      ).toBe(true);
    }
  });

  it('says what the sky is doing: the days between them show sun, haze, fog, rain, a storm, wind and dust', () => {
    const seen = new Set<Condition>();
    for (const day of all()) for (const hour of day.hourly) seen.add(hour.weather.condition);
    for (const wanted of [
      'clear',
      'haze',
      'fog',
      'rain',
      'thunderstorm',
      'windy',
      'dust',
      'cloudy',
    ] as const) {
      expect(seen.has(wanted), wanted).toBe(true);
    }
  });

  it('has day and night: the sun is up between sunrise and sunset and not otherwise', () => {
    for (const day of all()) {
      expect(Date.parse(day.sun.sunrise)).toBeLessThan(Date.parse(day.sun.sunset));
      for (const hour of day.hourly) {
        const h = hourOfDay(hour.at);
        const rise = hourOfDay(day.sun.sunrise);
        const set = hourOfDay(day.sun.sunset);
        expect(hour.weather.isDay, clock24(hour.at)).toBe(h >= rise && h < set);
      }
    }
  });

  it('keeps every weather figure physically possible', () => {
    for (const day of all()) {
      for (const { weather: w } of day.hourly) {
        expect(w.humidityPct).toBeGreaterThanOrEqual(0);
        expect(w.humidityPct).toBeLessThanOrEqual(100);
        expect(w.windKmh).toBeGreaterThanOrEqual(0);
        expect(w.windFromDeg).toBeGreaterThanOrEqual(0);
        expect(w.windFromDeg).toBeLessThan(360);
        expect(w.rainChancePct).toBeGreaterThanOrEqual(0);
        expect(w.rainChancePct).toBeLessThanOrEqual(100);
        expect(w.rainMm).toBeGreaterThanOrEqual(0);
        if (w.rainMm > 0) expect(w.rainChancePct).toBeGreaterThan(0);
        if (!w.isDay) expect(w.uvIndex).toBe(0);
      }
      for (const d of day.daily) expect(d.hiC).toBeGreaterThan(d.loC);
    }
  });

  it('the days differ in the ways the names say', () => {
    const by = (id: (typeof SAMPLE_IDS)[number]): TodayData => sampleDay(id);
    expect(by('good').aqi).toBeLessThan(by('moderate').aqi);
    expect(by('moderate').aqi).toBeLessThan(by('unhealthy').aqi);
    expect(by('unhealthy').aqi).toBeLessThan(by('hazardous').aqi);
    expect(by('hazardous').weather.tempC).toBeLessThanOrEqual(12);
    expect(by('hazardous').weather.humidityPct).toBeGreaterThanOrEqual(80);
    expect(by('unhealthy').daily[0]?.hiC).toBeGreaterThanOrEqual(33);
    expect(by('dusty').weather.windKmh).toBeGreaterThanOrEqual(30);
    expect(by('dusty').pollutants.pm10).toBeGreaterThan(by('dusty').pollutants.pm25 * 2.5);
    const rain = by('rainy').hourly.filter((h) => h.weather.rainMm > 0);
    expect(rain.length).toBeGreaterThanOrEqual(3);
  });

  it('shows the rain clearing the air: in the rainy day the AQI falls after the rain', () => {
    const day = sampleDay('rainy');
    const lastRainy = day.hourly.map((h) => h.weather.rainMm > 0).lastIndexOf(true);
    expect(day.hourly[lastRainy + 3]?.aqi ?? 999).toBeLessThan(day.hourly[0]?.aqi ?? 0);
  });

  it('is plainly marked as sample data, with a made-up station, not a real one', () => {
    for (const day of all()) {
      expect(day.provenance.mode).toBe('sample');
      expect(day.provenance.stations).toBeGreaterThan(0);
    }
  });

  it('gives all six pollutants, PM10 never below PM2.5', () => {
    for (const day of all()) {
      const p = day.pollutants;
      for (const value of Object.values(p)) expect(value).toBeGreaterThan(0);
      expect(p.pm10).toBeGreaterThanOrEqual(p.pm25);
      expect(p.pm25).toBe(day.pm25);
    }
  });
});
