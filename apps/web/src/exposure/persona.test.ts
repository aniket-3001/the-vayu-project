import { describe, expect, it } from 'vitest';
import { PERSONAS, personaById } from './persona';

describe('kinds of day', () => {
  it('has a child’s, an adult’s and a senior’s, with their usual days in plain words', () => {
    expect(PERSONAS.map((p) => p.id)).toEqual(['child', 'adult', 'senior']);
    expect(personaById('child').blurb).toMatch(/8 to 3/u);
    expect(personaById('adult').blurb).toMatch(/9 to 5/u);
  });

  it('shows three places at most for any of them', () => {
    for (const p of PERSONAS) expect(p.kinds.length).toBeLessThanOrEqual(3);
  });
});
