// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { PURIFIER_LINKS_KEY, linkPurifier, purifierName } from './purifierLinks';

beforeEach(() => {
  window.localStorage.clear();
});

describe('naming the purifier a tag belongs to', () => {
  it('knows nothing about a tag until it is named, then remembers the name', () => {
    expect(purifierName(window.localStorage, 0xbeef)).toBeUndefined();
    linkPurifier(window.localStorage, 0xbeef, 'Living room');
    expect(purifierName(window.localStorage, 0xbeef)).toBe('Living room');
    expect(purifierName(window.localStorage, 0x1234)).toBeUndefined();
  });

  it('keeps each tag’s name apart', () => {
    linkPurifier(window.localStorage, 1, 'Bedroom');
    linkPurifier(window.localStorage, 2, 'Study');
    expect(purifierName(window.localStorage, 1)).toBe('Bedroom');
    expect(purifierName(window.localStorage, 2)).toBe('Study');
  });

  it('trims the name and ignores an empty one', () => {
    linkPurifier(window.localStorage, 1, '   ');
    expect(purifierName(window.localStorage, 1)).toBeUndefined();
    linkPurifier(window.localStorage, 1, '  Bedroom ');
    expect(purifierName(window.localStorage, 1)).toBe('Bedroom');
  });

  it('survives a damaged store', () => {
    window.localStorage.setItem(PURIFIER_LINKS_KEY, '{not json');
    expect(purifierName(window.localStorage, 1)).toBeUndefined();
    linkPurifier(window.localStorage, 1, 'Bedroom');
    expect(purifierName(window.localStorage, 1)).toBe('Bedroom');
  });
});
