// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PERSONA,
  PERSONAS,
  PERSONA_STORAGE_KEY,
  loadPersona,
  personaById,
  savePersona,
} from './persona';

beforeEach(() => {
  window.localStorage.clear();
});

describe('personas', () => {
  it('offers a child, an adult and a senior, with their usual days in plain words', () => {
    expect(PERSONAS.map((p) => p.id)).toEqual(['child', 'adult', 'senior']);
    expect(personaById('child').blurb).toMatch(/8 to 3/u);
    expect(personaById('adult').blurb).toMatch(/9 to 5/u);
  });

  it('starts as an adult, remembers a choice, and ignores rubbish', () => {
    expect(loadPersona(window.localStorage)).toBe(DEFAULT_PERSONA);
    savePersona(window.localStorage, 'child');
    expect(loadPersona(window.localStorage)).toBe('child');
    window.localStorage.setItem(PERSONA_STORAGE_KEY, 'wizard');
    expect(loadPersona(window.localStorage)).toBe(DEFAULT_PERSONA);
  });
});
