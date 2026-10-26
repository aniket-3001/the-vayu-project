import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { API_URL } from '../config';
import { isNative } from '../native/splash';
import { AuthError, cognito, type AuthConfig, type CognitoClient, type Fetch } from './cognito';
import { Welcome } from './Welcome';
import { clearSession, freshIdToken, loadSession, saveSession, type Session } from './session';
import { liveLocation } from '../places/liveLocation';
import { accountSync, clearProfile, forgetLocation, httpSyncApi, type SyncStatus } from './sync';

export interface AccountState {
  /** Whether this deployment has accounts at all. Where it does not, the app needs no sign-in. */
  readonly enabled: boolean;
  readonly email?: string;
  /** True for someone using the app without an account: their places stay on this device and are never sent. */
  readonly guest: boolean;
  /** Ends the guest visit and shows the welcome screen, to sign in or create an account. */
  readonly leaveGuest: () => void;
  readonly status: SyncStatus;
  /** A sign-in token that works now, for calls that need to say who is asking. Absent when no one is signed in. */
  readonly idToken?: () => Promise<string>;
  readonly signOut: () => Promise<void>;
  /** Deletes what the account saved, then the account itself. */
  readonly deleteAccount: () => Promise<void>;
}

const OFF: AccountState = {
  enabled: false,
  guest: false,
  leaveGuest: () => undefined,
  status: { state: 'idle' },
  signOut: () => Promise.resolve(),
  deleteAccount: () => Promise.resolve(),
};

const Context = createContext<AccountState>(OFF);
export const useAccount = (): AccountState => useContext(Context);

/** Remembers on this device that the person chose to use the app as a guest. */
export const GUEST_KEY = 'vayu.guest.v1';

/** How many times the phone app asks for the account settings before it goes on without them, and the pause between. */
const CONFIG_TRIES = 4;
const CONFIG_RETRY_MS = 700;

/** How often a change on this device is sent to the account. */
const SAVE_EVERY_MS = 5_000;

/**
 * The door to the live app. It asks the API whether accounts are set up. Where they are not, the app opens as it
 * always did. Where they are, a person who is not signed in sees the welcome screen (sign in, create an account, or
 * try the recorded days without either), and a person who is gets their saved places and keeps them saved.
 */
export function AccountGate({
  children,
  fetchImpl = fetch,
  storage = window.localStorage,
  apiUrl = API_URL,
  reload = () => {
    window.location.reload();
  },
  onTry,
  guestAllowed = isNative(),
}: {
  readonly children: React.ReactNode;
  readonly fetchImpl?: Fetch;
  readonly storage?: Storage;
  readonly apiUrl?: string;
  readonly reload?: () => void;
  readonly onTry?: () => void;
  /** Whether "Continue as guest" is offered. Only the phone app offers it for now. */
  readonly guestAllowed?: boolean;
}): React.JSX.Element {
  const [config, setConfig] = useState<AuthConfig | 'off' | undefined>(undefined);
  const [session, setSession] = useState<Session | undefined>(() => loadSession(storage));
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState(() => guestAllowed && storage.getItem(GUEST_KEY) === '1');
  const [status, setStatus] = useState<SyncStatus>({ state: 'idle' });

  useEffect(() => {
    let current = true;
    const url = `${apiUrl.replace(/\/$/u, '')}/v1/auth-config`;
    // A phone can start with its network not quite up. Giving up on the first miss would drop the person into the app
    // with no sign in at all, so the phone app asks a few times, a little apart, before it goes on without.
    const tries = guestAllowed ? CONFIG_TRIES : 1;
    const ask = async (attempt: number): Promise<Partial<AuthConfig> & { enabled?: boolean }> => {
      try {
        const res = await fetchImpl(url);
        return (await res.json()) as Partial<AuthConfig> & { enabled?: boolean };
      } catch (error) {
        if (attempt + 1 >= tries || !current) throw error;
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, CONFIG_RETRY_MS * (attempt + 1));
        });
        return ask(attempt + 1);
      }
    };
    ask(0)
      .then((body) => {
        if (!current) return;
        if (body.enabled === true && body.userPoolId && body.clientId && body.region)
          setConfig({ userPoolId: body.userPoolId, clientId: body.clientId, region: body.region });
        else setConfig('off');
      })
      .catch(() => {
        if (current) setConfig('off');
      });
    return () => {
      current = false;
    };
  }, [apiUrl, fetchImpl, guestAllowed]);

  const client: CognitoClient | undefined = useMemo(
    () => (typeof config === 'object' ? cognito(config, fetchImpl) : undefined),
    [config, fetchImpl],
  );
  const sync = useMemo(
    () =>
      client === undefined
        ? undefined
        : accountSync({
            storage,
            api: httpSyncApi(apiUrl, () => freshIdToken(client, storage), fetchImpl),
            onStatus: setStatus,
          }),
    [client, storage, apiUrl, fetchImpl],
  );
  const syncRef = useRef(sync);
  syncRef.current = sync;
  // Held in a ref so a new function on each render cannot restart the effects that use it.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  // Signed in: meet the account once, then keep it up to date and look for changes from another device.
  useEffect(() => {
    if (sync === undefined || session === undefined) return undefined;
    let current = true;
    sync.start().then(
      (result) => {
        if (!current) return;
        if (result === 'reload') reloadRef.current();
        else setReady(true);
      },
      (error: unknown) => {
        if (!current) return;
        if (error instanceof AuthError && error.code === 'signed_out') {
          setSession(undefined);
          return;
        }
        // The account could not be reached: the app still works from this device, and says so on the account page.
        setStatus({ state: 'error' });
        setReady(true);
      },
    );
    const timer = window.setInterval(() => {
      void sync.flush();
    }, SAVE_EVERY_MS);
    const onVisible = (): void => {
      if (document.visibilityState === 'hidden') void sync.flush();
      else
        void sync.pull().then(
          (result) => {
            if (result === 'reload') reloadRef.current();
          },
          () => undefined,
        );
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync, session]);

  const value = useMemo<AccountState>(() => {
    if (client === undefined || session === undefined) return OFF;
    const finish = (): void => {
      clearProfile(storage);
      clearSession(storage);
      reloadRef.current();
    };
    return {
      enabled: true,
      guest: false,
      leaveGuest: () => undefined,
      email: session.email,
      idToken: () => freshIdToken(client, storage),
      status,
      signOut: async () => {
        await syncRef.current?.flush();
        const tokens = loadSession(storage)?.tokens;
        if (tokens !== undefined) await client.signOut(tokens.accessToken).catch(() => undefined);
        finish();
      },
      deleteAccount: async () => {
        const api = httpSyncApi(apiUrl, () => freshIdToken(client, storage), fetchImpl);
        await api.remove();
        await freshIdToken(client, storage);
        const tokens = loadSession(storage)?.tokens;
        if (tokens === undefined) throw new AuthError('signed_out', 'Sign in to use your account.');
        await client.deleteUser(tokens.accessToken);
        finish();
      },
    };
  }, [client, session, status, storage, apiUrl, fetchImpl]);

  if (config === undefined) return <p className="gate-note">Loading…</p>;
  if (config === 'off' || client === undefined) return <>{children}</>;
  if (session === undefined && guest) {
    const asGuest: AccountState = {
      ...OFF,
      guest: true,
      leaveGuest: () => {
        stopFollowing(storage);
        storage.removeItem(GUEST_KEY);
        setGuest(false);
      },
    };
    return <Context.Provider value={asGuest}>{children}</Context.Provider>;
  }
  if (session === undefined)
    return (
      <Welcome
        client={client}
        onSignedIn={(next) => {
          // A new visit starts with the device not following anyone: a guest's location is not the account's.
          stopFollowing(storage);
          saveSession(storage, next);
          storage.removeItem(GUEST_KEY);
          setGuest(false);
          setReady(false);
          setSession(next);
        }}
        holdsData={Object.keys(localDataKeys(storage)).length > 0}
        {...(onTry === undefined ? {} : { onTry })}
        {...(guestAllowed
          ? {
              onGuest: () => {
                storage.setItem(GUEST_KEY, '1');
                setGuest(true);
              },
            }
          : {})}
      />
    );
  if (!ready) return <p className="gate-note">Getting your places…</p>;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Switches off the device following, and forgets where it has been. */
const stopFollowing = (storage: Storage): void => {
  try {
    liveLocation().set(false);
  } catch {
    // Nothing was following.
  }
  forgetLocation(storage);
};

const localDataKeys = (storage: Storage): Record<string, true> => {
  const out: Record<string, true> = {};
  for (const key of ['vayu.pins.v1', 'vayu.people.v1'])
    if (storage.getItem(key) !== null) out[key] = true;
  return out;
};
