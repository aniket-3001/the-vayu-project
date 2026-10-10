import type { SpotKind } from './spots';

/** Who the exposure is for. It decides which places are shown, and their usual hours. */
export type Persona = 'child' | 'adult' | 'senior';

export interface PersonaInfo {
  readonly id: Persona;
  readonly label: string;
  readonly blurb: string;
  /** The places that matter for this person, in the order they are shown. */
  readonly kinds: readonly SpotKind[];
}

export const PERSONAS: readonly PersonaInfo[] = [
  { id: 'child', label: 'Child', blurb: 'School, 8 to 3', kinds: ['home', 'school', 'outdoor'] },
  { id: 'adult', label: 'Adult', blurb: 'Office, 9 to 5', kinds: ['home', 'work', 'outdoor'] },
  {
    id: 'senior',
    label: 'Senior',
    blurb: 'Mostly home, a morning walk',
    kinds: ['home', 'outdoor'],
  },
];

export const DEFAULT_PERSONA: Persona = 'adult';
export const PERSONA_STORAGE_KEY = 'vayu.persona.v1';

const FALLBACK: PersonaInfo = {
  id: 'adult',
  label: 'Adult',
  blurb: 'Office, 9 to 5',
  kinds: ['home', 'work', 'outdoor'],
};

export const personaById = (id: Persona): PersonaInfo =>
  PERSONAS.find((p) => p.id === id) ?? FALLBACK;

export function loadPersona(storage: Storage): Persona {
  try {
    const raw = storage.getItem(PERSONA_STORAGE_KEY);
    return PERSONAS.find((p) => p.id === raw)?.id ?? DEFAULT_PERSONA;
  } catch {
    return DEFAULT_PERSONA;
  }
}

export function savePersona(storage: Storage, persona: Persona): void {
  try {
    storage.setItem(PERSONA_STORAGE_KEY, persona);
  } catch {
    // Best effort.
  }
}
