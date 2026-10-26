// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, chooseTheme, loadChoice, resolveTheme, saveChoice, THEME_KEY } from './theme';

const memoryStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
    clear: () => {
      m.clear();
    },
    key: () => null,
    length: 0,
  };
};

afterEach(() => {
  delete document.documentElement.dataset.theme;
  window.localStorage.clear();
});

describe('theme choice', () => {
  it('follows the device until the person picks', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('remembers a pick and ignores anything else in storage', () => {
    const storage = memoryStorage();
    expect(loadChoice(storage)).toBe('system');
    saveChoice('dark', storage);
    expect(loadChoice(storage)).toBe('dark');
    storage.setItem(THEME_KEY, 'purple');
    expect(loadChoice(storage)).toBe('system');
  });

  it('copes with storage that refuses', () => {
    const broken = {
      getItem: () => {
        throw new Error('no');
      },
      setItem: () => {
        throw new Error('no');
      },
    } as unknown as Storage;
    expect(loadChoice(broken)).toBe('system');
    expect(() => {
      saveChoice('dark', broken);
    }).not.toThrow();
  });

  it('puts the look on the page', () => {
    chooseTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(applyTheme('light')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
