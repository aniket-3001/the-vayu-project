/**
 * Who the person is looking after. Saved on this device only: it is never sent to a server, because
 * names and health conditions are exactly the kind of data we should not collect.
 */
export type AgeGroup = 'child' | 'adult' | 'older';

export interface Member {
  readonly id: string;
  readonly name: string;
  readonly ageGroup: AgeGroup;
  /** Asthma or another lung condition, a heart condition, or pregnancy. */
  readonly condition: boolean;
}

export interface Profile {
  readonly members: readonly Member[];
  readonly selectedId: string;
}

export const MAX_MEMBERS = 6;
const STORAGE_KEY = 'vayu.profile.v1';

export const AGE_GROUP_LABEL: Record<AgeGroup, string> = {
  child: 'Child',
  adult: 'Adult',
  older: 'Older adult (65 or more)',
};

const ME: Member = { id: 'me', name: 'Me', ageGroup: 'adult', condition: false };
const DEFAULT_PROFILE: Profile = { members: [ME], selectedId: ME.id };

/** Children, older adults and anyone with a condition get the stricter air limit. */
export const isSensitive = (member: Member): boolean =>
  member.ageGroup !== 'adult' || member.condition;

/** A short plain-language description, for the chip and the profile list. */
export function describeMember(member: Member): string {
  const group = member.ageGroup === 'older' ? 'older adult' : member.ageGroup;
  return member.condition ? `${group} with a lung, heart or pregnancy condition` : group;
}

function isMember(value: unknown): value is Member {
  const member = value as Partial<Member> | null;
  return (
    typeof member?.id === 'string' &&
    typeof member.name === 'string' &&
    (member.ageGroup === 'child' || member.ageGroup === 'adult' || member.ageGroup === 'older') &&
    typeof member.condition === 'boolean'
  );
}

/** The saved profile, or just "Me" if nothing was saved. Never throws. */
export function loadProfile(storage: Storage): Profile {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw) as { members?: unknown; selectedId?: unknown };
    const members = Array.isArray(parsed.members) ? parsed.members.filter(isMember) : [];
    if (members.length === 0) return DEFAULT_PROFILE;
    const selected = members.find((member) => member.id === parsed.selectedId) ?? members[0];
    return { members, selectedId: selected?.id ?? ME.id };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(storage: Storage, profile: Profile): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Best effort: a blocked or full storage must never break the screen.
  }
}

export const selectedMember = (profile: Profile): Member =>
  profile.members.find((member) => member.id === profile.selectedId) ?? profile.members[0] ?? ME;

const newId = (): string => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function addMember(profile: Profile, input: Omit<Member, 'id'>): Profile {
  const name = input.name.trim();
  if (name === '' || profile.members.length >= MAX_MEMBERS) return profile;
  return { ...profile, members: [...profile.members, { ...input, name, id: newId() }] };
}

export function updateMember(profile: Profile, id: string, input: Omit<Member, 'id'>): Profile {
  const name = input.name.trim();
  if (name === '') return profile;
  return {
    ...profile,
    members: profile.members.map((member) => (member.id === id ? { ...input, name, id } : member)),
  };
}

/** Someone must always be selected, so the last member cannot be removed. */
export function removeMember(profile: Profile, id: string): Profile {
  if (profile.members.length <= 1) return profile;
  const members = profile.members.filter((member) => member.id !== id);
  const selectedId = profile.selectedId === id ? (members[0]?.id ?? ME.id) : profile.selectedId;
  return { members, selectedId };
}

export function selectMember(profile: Profile, id: string): Profile {
  return profile.members.some((member) => member.id === id)
    ? { ...profile, selectedId: id }
    : profile;
}
