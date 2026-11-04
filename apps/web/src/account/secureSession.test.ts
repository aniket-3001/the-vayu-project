// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INSTALL_MARKER,
  installSecureSession,
  resetSecureSession,
  sessionStore,
  type SecurePlugin,
} from './secureSession';
import { SESSION_KEY } from './session';

const SESSION = JSON.stringify({ email: 'a@b.in', tokens: { refreshToken: 'r' } });

/** A secure store in memory that records what was asked of it. */
function fakePlugin(initial: Record<string, string> = {}): {
  plugin: SecurePlugin;
  held: Map<string, string>;
  calls: string[];
} {
  const held = new Map(Object.entries(initial));
  const calls: string[] = [];
  return {
    held,
    calls,
    plugin: {
      get: (key) => {
        calls.push(`get ${key}`);
        return Promise.resolve(held.get(key) ?? null);
      },
      set: (key, value) => {
        calls.push(`set ${key}`);
        held.set(key, value);
        return Promise.resolve();
      },
      remove: (key) => {
        calls.push(`remove ${key}`);
        return Promise.resolve(held.delete(key));
      },
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  resetSecureSession();
});

describe('on the website', () => {
  it('changes nothing: the session stays in the browser storage', async () => {
    const load = vi.fn();
    const store = await installSecureSession({ native: false, load });
    expect(store).toBe(window.localStorage);
    expect(sessionStore()).toBe(window.localStorage);
    expect(load).not.toHaveBeenCalled();
  });
});

describe('on a phone', () => {
  it('keeps the session in the secure store and out of browser storage', async () => {
    const { plugin, held } = fakePlugin();
    const store = await installSecureSession({ native: true, load: () => Promise.resolve(plugin) });
    store.setItem(SESSION_KEY, SESSION);
    await Promise.resolve();
    expect(store.getItem(SESSION_KEY)).toBe(SESSION);
    expect(held.get(SESSION_KEY)).toBe(SESSION);
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(sessionStore()).toBe(store);
  });

  it('sends everything else to the browser storage as before', async () => {
    const { plugin, held } = fakePlugin();
    const store = await installSecureSession({ native: true, load: () => Promise.resolve(plugin) });
    store.setItem('vayu.places', '[]');
    expect(window.localStorage.getItem('vayu.places')).toBe('[]');
    expect(store.getItem('vayu.places')).toBe('[]');
    expect(held.has('vayu.places')).toBe(false);
    store.removeItem('vayu.places');
    expect(window.localStorage.getItem('vayu.places')).toBeNull();
  });

  it('removes the session from the secure store on sign-out', async () => {
    const { plugin, held } = fakePlugin();
    const store = await installSecureSession({ native: true, load: () => Promise.resolve(plugin) });
    store.setItem(SESSION_KEY, SESSION);
    store.removeItem(SESSION_KEY);
    await Promise.resolve();
    expect(store.getItem(SESSION_KEY)).toBeNull();
    expect(held.has(SESSION_KEY)).toBe(false);
  });

  it('reads a session saved on an earlier run', async () => {
    window.localStorage.setItem(INSTALL_MARKER, '1');
    const { plugin } = fakePlugin({ [SESSION_KEY]: SESSION });
    const store = await installSecureSession({ native: true, load: () => Promise.resolve(plugin) });
    expect(store.getItem(SESSION_KEY)).toBe(SESSION);
  });

  it('moves a session an earlier version left in browser storage, and removes the old copy', async () => {
    window.localStorage.setItem(SESSION_KEY, SESSION);
    const { plugin, held } = fakePlugin();
    const store = await installSecureSession({ native: true, load: () => Promise.resolve(plugin) });
    expect(store.getItem(SESSION_KEY)).toBe(SESSION);
    expect(held.get(SESSION_KEY)).toBe(SESSION);
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('does not trust a Keychain entry left behind by an app that was deleted', async () => {
    // No install marker: this is a fresh install, but iOS keeps Keychain items after an app is removed.
    const { plugin, held } = fakePlugin({ [SESSION_KEY]: SESSION });
    const store = await installSecureSession({ native: true, load: () => Promise.resolve(plugin) });
    expect(store.getItem(SESSION_KEY)).toBeNull();
    expect(held.has(SESSION_KEY)).toBe(false);
    expect(window.localStorage.getItem(INSTALL_MARKER)).toBe('1');
  });

  it('keeps the old copy if it could not be saved safely', async () => {
    window.localStorage.setItem(INSTALL_MARKER, '1');
    window.localStorage.setItem(SESSION_KEY, SESSION);
    const plugin: SecurePlugin = {
      get: () => Promise.resolve(null),
      set: () => Promise.reject(new Error('keychain locked')),
      remove: () => Promise.resolve(true),
    };
    const store = await installSecureSession({ native: true, load: () => Promise.resolve(plugin) });
    // It falls back to the browser storage, with the session still in it: nobody is signed out by a failure here.
    expect(store).toBe(window.localStorage);
    expect(window.localStorage.getItem(SESSION_KEY)).toBe(SESSION);
  });

  it('falls back to the browser storage if the plugin is missing', async () => {
    const store = await installSecureSession({
      native: true,
      load: () => Promise.reject(new Error('no plugin')),
    });
    expect(store).toBe(window.localStorage);
  });

  it('keeps working in this run when a write to the secure store fails', async () => {
    window.localStorage.setItem(INSTALL_MARKER, '1');
    const plugin: SecurePlugin = {
      get: () => Promise.resolve(null),
      set: () => Promise.reject(new Error('full')),
      remove: () => Promise.resolve(true),
    };
    const store = await installSecureSession({ native: true, load: () => Promise.resolve(plugin) });
    store.setItem(SESSION_KEY, SESSION);
    expect(store.getItem(SESSION_KEY)).toBe(SESSION);
  });
});
