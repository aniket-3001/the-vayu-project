// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Pin } from '../data/pins';
import { TODAY, YESTERDAY } from '../exposure/model';
import type { Person } from '../exposure/people';
import { addedText, minutesIn, parseOuting } from './outingParse';

const people: Person[] = [
  { id: 'me', name: 'Me', age: 30, day: 'work' },
  { id: 'a', name: 'Asha', age: 9, day: 'school' },
  { id: 'd', name: 'Dev', age: 70, day: 'none' },
];
const pins: Pin[] = [
  { id: 'h', name: 'Home', lat: 28.59, lng: 77.05 },
  { id: 'p', name: 'Park', lat: 28.55, lng: 77.2 },
];
const now = { date: TODAY, minutes: 17 * 60 + 30 };
const parse = (text: string): ReturnType<typeof parseOuting> =>
  parseOuting(text, people, pins, now);

describe('how long, in words', () => {
  it.each([
    ['40 minutes', 40],
    ['for 45 mins', 45],
    ['an hour', 60],
    ['1 hour 20 minutes', 80],
    ['half an hour', 30],
    ['2 hours', 120],
    ['a couple of hours', 120],
    ['quarter of an hour', 15],
  ])('%s is %s minutes', (text, minutes) => {
    expect(minutesIn(text)).toBe(minutes);
  });
  it('is nothing when no time is said', () => {
    expect(minutesIn('went for a walk')).toBeUndefined();
  });
});

describe('telling the assistant what someone did outdoors', () => {
  it('adds a walk in the park, ending now, with trees', () => {
    const got = parse('Asha took a walk in the park for 40 minutes');
    expect(got).toMatchObject({
      kind: 'add',
      person: { name: 'Asha' },
      outing: { activity: 'walk', minutes: 40, trees: true, date: TODAY, pin: { name: 'Park' } },
    });
    if (got?.kind === 'add') expect(got.outing.start).toBe(17 * 60 + 30 - 40);
  });

  it('reads play, cycling, a time of day and yesterday', () => {
    expect(parse('Dev played outside for an hour')).toMatchObject({
      kind: 'add',
      outing: { activity: 'play', minutes: 60 },
    });
    expect(parse('Asha cycled in the park for 30 minutes')).toMatchObject({
      outing: { activity: 'cycle' },
    });
    const evening = parse('Asha walked in the park this evening for 30 minutes');
    expect(evening).toMatchObject({ kind: 'add', outing: { start: 17 * 60 } });
    const yesterday = parse('Asha went for a walk in the park yesterday morning for 45 minutes');
    expect(yesterday).toMatchObject({
      kind: 'add',
      outing: { date: YESTERDAY, start: 7 * 60, minutes: 45 },
    });
    expect(parse('Dev walked at 6:30 am for 30 minutes')).toMatchObject({
      outing: { start: 6 * 60 + 30 },
    });
  });

  it('puts it where the sentence says, if that is one of the pinned places', () => {
    expect(parse('Asha played at home for an hour')).toMatchObject({
      outing: { pin: { name: 'Home' }, trees: false },
    });
  });

  it('asks how long when it is not said, and says when the time has not come', () => {
    expect(parse('Asha went for a walk in the park')).toMatchObject({
      kind: 'problem',
      text: expect.stringContaining('For how long') as string,
    });
    expect(parse('Asha walked in the park at 9 pm for an hour')).toMatchObject({
      kind: 'problem',
      text: expect.stringContaining('has not happened yet') as string,
    });
  });

  it('leaves questions, and sentences about nobody on the list, to the rest of the assistant', () => {
    expect(parse('When can Asha go for a walk?')).toBeUndefined();
    expect(parse('Can Asha play outside today')).toBeUndefined();
    expect(parse('Is the park safe for a walk?')).toBeUndefined();
    expect(parse('Priya walked in the park for 40 minutes')).toBeUndefined();
    expect(parse('Asha is at school')).toBeUndefined();
  });

  it('adds your own walk to your day when you say “I”, as well as anyone else’s', () => {
    const got = parse('I walked in the park for 30 minutes');
    expect(got).toMatchObject({ kind: 'add', person: { id: 'me' }, outing: { minutes: 30 } });
    if (got?.kind === 'add')
      expect(addedText(got.person, got.outing)).toMatch(/^Added to your day:/u);
  });

  it('says what it added, and the air there', () => {
    const got = parse('Asha took a walk in the park for 40 minutes');
    if (got?.kind !== 'add') throw new Error('not added');
    const text = addedText(got.person, got.outing);
    expect(text).toMatch(
      /^Added to Asha’s day: walk or run in Park, 40 minutes from 16:50, today\./u,
    );
    expect(text).toMatch(/AQI \d+/u);
    expect(text).toMatch(/lower for trees \(assumed\)/u);
  });
});
