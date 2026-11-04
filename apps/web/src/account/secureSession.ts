import { isNative } from '../native/splash';
import { SESSION_KEY } from './session';

/**
 * Where the sign-in session (the ID, access and refresh tokens) is kept.
 *
 * In the website it stays in the browser's own storage, as before. In the phone apps it goes to the phone's secure
 * store instead: the iOS Keychain and the Android Keystore, which other apps and a copied-off backup cannot read. The
 * rest of what the app saves (places, settings) stays where it was.
 *
 * The app reads its storage synchronously everywhere, and the secure store is asynchronous. So the session is read
 * once at start-up, before the first screen is drawn, and kept in memory; a change is written to the secure store
 * behind the scenes. If the secure store cannot be used at all, the app carries on exactly as the website does.
 */
export interface SecurePlugin {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<unknown>;
}

/** Set once on this install, so a Keychain entry left behind by a deleted app is not mistaken for this install's. */
export const INSTALL_MARKER = 'vayu.secure.installed';

const defaultPlugin = async (): Promise<SecurePlugin> => {
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
  // Keep the session on this phone: never in iCloud Keychain.
  await SecureStorage.setSynchronize(false);
  // A plain object, not the plugin: see nativeSpeech.ts for why a plugin is never returned from a promise.
  return {
    get: async (key) => {
      const value = await SecureStorage.get(key, false, false);
      return typeof value === 'string' ? value : null;
    },
    set: (key, value) => SecureStorage.set(key, value, false, false),
    remove: (key) => SecureStorage.remove(key, false),
  };
};

let current: Storage | undefined;

/** The storage that holds the session: the secure one once `installSecureSession` has run on a phone, else the browser's. */
export function sessionStore(): Storage {
  return current ?? window.localStorage;
}

/** A Storage that sends only the session key to the secure store, and everything else to `local`. */
function routed(local: Storage, plugin: SecurePlugin, initial: string | null): Storage {
  let held = initial;
  return {
    get length() {
      return local.length;
    },
    clear: () => {
      local.clear();
      held = null;
      void plugin.remove(SESSION_KEY).catch(() => undefined);
    },
    key: (index) => local.key(index),
    getItem: (key) => (key === SESSION_KEY ? held : local.getItem(key)),
    setItem: (key, value) => {
      if (key !== SESSION_KEY) {
        local.setItem(key, value);
        return;
      }
      held = value;
      // If this write is lost the person signs in again after a restart; the app still works until then.
      void plugin.set(SESSION_KEY, value).catch(() => undefined);
    },
    removeItem: (key) => {
      if (key !== SESSION_KEY) {
        local.removeItem(key);
        return;
      }
      held = null;
      void plugin.remove(SESSION_KEY).catch(() => undefined);
    },
  };
}

/**
 * Call once at start-up, before the first screen. On a phone it moves the session to the secure store (bringing along
 * one an earlier version left in browser storage) and returns the storage to use; elsewhere it changes nothing.
 * It never throws.
 */
export async function installSecureSession(
  options: {
    readonly native?: boolean;
    readonly local?: Storage;
    readonly load?: () => Promise<SecurePlugin>;
  } = {},
): Promise<Storage> {
  const local = options.local ?? window.localStorage;
  if (!(options.native ?? isNative())) {
    current = local;
    return local;
  }
  try {
    const plugin = await (options.load ?? defaultPlugin)();
    // A fresh install: whatever the Keychain still holds belongs to an app that was deleted, not to this one.
    if (local.getItem(INSTALL_MARKER) === null) {
      await plugin.remove(SESSION_KEY).catch(() => undefined);
      local.setItem(INSTALL_MARKER, '1');
    }
    let value = await plugin.get(SESSION_KEY).catch(() => null);
    const legacy = local.getItem(SESSION_KEY);
    if (legacy !== null) {
      // A session an earlier version kept in browser storage moves across, and is only removed once safely stored.
      if (value === null) {
        await plugin.set(SESSION_KEY, legacy);
        value = legacy;
      }
      local.removeItem(SESSION_KEY);
    }
    current = routed(local, plugin, value);
  } catch {
    current = local;
  }
  return current;
}

/** For the tests: forget what was installed. */
export function resetSecureSession(): void {
  current = undefined;
}
