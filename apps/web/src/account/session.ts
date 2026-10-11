import { AuthError, type CognitoClient, type Tokens } from './cognito';

/**
 * The signed-in person on this device. The tokens are kept in the browser's own storage under a name that is not
 * synced to the account, and they expire on their own: the ID token after an hour, the refresh token after thirty days.
 */
export const SESSION_KEY = 'vayu-auth.v1';

export interface Session {
  readonly email: string;
  readonly tokens: Tokens;
}

export function loadSession(storage: Storage): Session | undefined {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as Partial<Session>;
    const t = parsed.tokens;
    if (
      typeof parsed.email !== 'string' ||
      typeof t?.idToken !== 'string' ||
      typeof t.accessToken !== 'string' ||
      typeof t.refreshToken !== 'string' ||
      typeof t.expiresAt !== 'number'
    )
      return undefined;
    return { email: parsed.email, tokens: t };
  } catch {
    return undefined;
  }
}

export function saveSession(storage: Storage, session: Session): void {
  storage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(storage: Storage): void {
  storage.removeItem(SESSION_KEY);
}

/** A little before the end, so a token is not used in the last second of its life. */
const SPARE_MS = 60_000;

/**
 * An ID token that works now: the one held, or a fresh one if it is about to stop. If the refresh token no longer
 * works the session is over: it is cleared and the person is asked to sign in again.
 */
export async function freshIdToken(
  client: Pick<CognitoClient, 'refresh'>,
  storage: Storage,
  now: () => number = Date.now,
): Promise<string> {
  const session = loadSession(storage);
  if (session === undefined) throw new AuthError('signed_out', 'Sign in to use your account.');
  if (session.tokens.expiresAt - now() > SPARE_MS) return session.tokens.idToken;
  try {
    const tokens = await client.refresh(session.tokens.refreshToken);
    saveSession(storage, { email: session.email, tokens });
    return tokens.idToken;
  } catch (error) {
    if (error instanceof AuthError && error.code === 'offline') throw error;
    clearSession(storage);
    throw new AuthError('signed_out', 'Your sign-in has ended. Sign in again.');
  }
}
