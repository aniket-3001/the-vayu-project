import { describe, expect, it } from 'vitest';
import { fixtureDataSource } from '../data/fixtureSource';
import { buildTodayModel } from './todayModel';

describe('the Today model', () => {
  it('builds a calm, action-first headline from sample data', async () => {
    const model = buildTodayModel(await fixtureDataSource().load('home'));
    expect(model.headline).toMatch(/^(Good hour for a walk|No clean hour outside today)/);
    expect(model.placeName).toBe('Home');
  });

  it('shows the latest observed air with its provenance, labelled as sample data', async () => {
    const { current } = buildTodayModel(await fixtureDataSource().load('home'));
    expect(current).not.toBeNull();
    expect(current?.prov.simulated).toBe(true);
    expect(current?.prov.label).toBe('Nearby station');
  });

  it('gives a strip of hours and a week of days', async () => {
    const model = buildTodayModel(await fixtureDataSource().load('park'));
    expect(model.hourly.length).toBeGreaterThan(36);
    expect(model.week).toHaveLength(7);
  });

  it('offers a walk tip and an airing tip', async () => {
    const model = buildTodayModel(await fixtureDataSource().load('school'));
    expect(model.tips.map((tip) => tip.kind)).toEqual(['walk', 'airing']);
  });

  it('is cleaner at the park than at the school in the sample data', async () => {
    const source = fixtureDataSource();
    const park = buildTodayModel(await source.load('park')).current?.pm25 ?? 0;
    const school = buildTodayModel(await source.load('school')).current?.pm25 ?? 0;
    expect(park).toBeLessThan(school);
  });

  it('never invents a place', async () => {
    await expect(fixtureDataSource().load('nowhere')).rejects.toThrow(RangeError);
  });

  it('is pure: the same input gives the same model', async () => {
    const input = await fixtureDataSource().load('office');
    expect(buildTodayModel(input)).toEqual(buildTodayModel(input));
  });
});
