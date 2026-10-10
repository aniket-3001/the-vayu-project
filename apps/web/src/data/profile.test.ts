// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_MEMBERS,
  addMember,
  describeMember,
  isSensitive,
  loadProfile,
  removeMember,
  saveProfile,
  selectMember,
  selectedMember,
  updateMember,
} from './profile';

beforeEach(() => {
  window.localStorage.clear();
});

const child = { name: 'Aarav', ageGroup: 'child', condition: false } as const;

describe('profile', () => {
  it('starts with just "Me", an adult with no condition', () => {
    const profile = loadProfile(window.localStorage);
    expect(profile.members).toHaveLength(1);
    expect(selectedMember(profile)).toMatchObject({ name: 'Me', ageGroup: 'adult' });
  });

  it('gives the stricter limit to children, older adults and anyone with a condition', () => {
    const base = { id: 'x', name: 'X' } as const;
    expect(isSensitive({ ...base, ageGroup: 'adult', condition: false })).toBe(false);
    expect(isSensitive({ ...base, ageGroup: 'child', condition: false })).toBe(true);
    expect(isSensitive({ ...base, ageGroup: 'older', condition: false })).toBe(true);
    expect(isSensitive({ ...base, ageGroup: 'adult', condition: true })).toBe(true);
  });

  it('describes a member in plain words', () => {
    expect(describeMember({ id: 'a', name: 'A', ageGroup: 'older', condition: true })).toBe(
      'older adult with a lung, heart or pregnancy condition',
    );
    expect(describeMember({ id: 'a', name: 'A', ageGroup: 'child', condition: false })).toBe(
      'child',
    );
  });

  it('adds, edits, selects and removes family members, and remembers them', () => {
    let profile = addMember(loadProfile(window.localStorage), child);
    const added = profile.members[1];
    expect(added?.name).toBe('Aarav');
    profile = updateMember(profile, added?.id ?? '', {
      ...child,
      name: ' Aarav K ',
      condition: true,
    });
    expect(profile.members[1]).toMatchObject({ name: 'Aarav K', condition: true });
    profile = selectMember(profile, added?.id ?? '');
    saveProfile(window.localStorage, profile);

    const again = loadProfile(window.localStorage);
    expect(selectedMember(again).name).toBe('Aarav K');
    const afterRemove = removeMember(again, added?.id ?? '');
    expect(afterRemove.members.map((member) => member.name)).toEqual(['Me']);
    expect(selectedMember(afterRemove).name).toBe('Me');
  });

  it('refuses a blank name, a seventh member, and removing the last person', () => {
    let profile = loadProfile(window.localStorage);
    expect(addMember(profile, { ...child, name: '   ' })).toBe(profile);
    for (let i = 0; i < MAX_MEMBERS + 2; i += 1)
      profile = addMember(profile, { ...child, name: `K${i}` });
    expect(profile.members).toHaveLength(MAX_MEMBERS);
    const solo = loadProfile(window.localStorage);
    expect(removeMember(solo, 'me')).toBe(solo);
  });

  it('survives corrupt or blocked storage', () => {
    window.localStorage.setItem('vayu.profile.v1', '{nope');
    expect(loadProfile(window.localStorage).members).toHaveLength(1);
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(loadProfile(blocked).members).toHaveLength(1);
    expect(() => {
      saveProfile(blocked, loadProfile(window.localStorage));
    }).not.toThrow();
  });
});
