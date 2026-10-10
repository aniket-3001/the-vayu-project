// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ME,
  MAX_PEOPLE,
  PEOPLE_STORAGE_KEY,
  addPerson,
  defaultDayFor,
  initials,
  loadHousehold,
  personaOf,
  removePerson,
  saveHousehold,
} from './people';

beforeEach(() => {
  window.localStorage.clear();
});

describe('people you track', () => {
  it('starts with just you', () => {
    expect(loadHousehold(window.localStorage)).toEqual({ people: [ME], current: 'me' });
  });

  it('sends children to school, adults to work, and people 65 and over mostly stay home', () => {
    expect(defaultDayFor(8)).toBe('school');
    expect(defaultDayFor(17)).toBe('school');
    expect(defaultDayFor(18)).toBe('work');
    expect(defaultDayFor(64)).toBe('work');
    expect(defaultDayFor(65)).toBe('none');
    expect(personaOf({ day: 'school' })).toBe('child');
    expect(personaOf({ day: 'work' })).toBe('adult');
    expect(personaOf({ day: 'none' })).toBe('senior');
  });

  it('adds a person, selects them, and remembers them', () => {
    const next = addPerson(loadHousehold(window.localStorage), {
      name: '  Asha ',
      age: 9.4,
      day: 'school',
    });
    expect(next.people).toHaveLength(2);
    const added = next.people[1];
    expect(added).toMatchObject({ name: 'Asha', age: 9, day: 'school' });
    expect(next.current).toBe(added?.id);
    saveHousehold(window.localStorage, next);
    expect(loadHousehold(window.localStorage)).toEqual(next);
  });

  it('refuses a missing name, a silly age, and more than six people', () => {
    const one = loadHousehold(window.localStorage);
    expect(addPerson(one, { name: '  ', age: 10, day: 'school' })).toBe(one);
    expect(addPerson(one, { name: 'A', age: -1, day: 'school' })).toBe(one);
    expect(addPerson(one, { name: 'A', age: 200, day: 'school' })).toBe(one);
    expect(addPerson(one, { name: 'A', age: Number.NaN, day: 'school' })).toBe(one);
    let full = one;
    for (let i = 0; i < MAX_PEOPLE + 2; i++)
      full = addPerson(full, { name: `P${String(i)}`, age: 30, day: 'work' });
    expect(full.people).toHaveLength(MAX_PEOPLE);
  });

  it('removes a person, moves the selection off them, and never removes the last one', () => {
    const two = addPerson(loadHousehold(window.localStorage), {
      name: 'Asha',
      age: 9,
      day: 'school',
    });
    const added = two.people[1];
    if (added === undefined) throw new Error('no one added');
    const back = removePerson(two, added.id);
    expect(back.people).toEqual([ME]);
    expect(back.current).toBe('me');
    expect(removePerson(back, 'me')).toBe(back);
  });

  it('survives rubbish in storage', () => {
    window.localStorage.setItem(PEOPLE_STORAGE_KEY, '{{');
    expect(loadHousehold(window.localStorage).people).toEqual([ME]);
    window.localStorage.setItem(
      PEOPLE_STORAGE_KEY,
      JSON.stringify({ people: [{ id: 1 }], current: 'x' }),
    );
    expect(loadHousehold(window.localStorage).people).toEqual([ME]);
  });

  it('makes initials from a name', () => {
    expect(initials('Asha Rao')).toBe('AR');
    expect(initials('  me ')).toBe('M');
    expect(initials('')).toBe('');
  });
});
