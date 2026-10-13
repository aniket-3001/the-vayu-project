// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountGate, useAccount } from './AccountContext';
import { AccountScreen } from './AccountScreen';
import { SESSION_KEY } from './session';

const CONFIG = {
  enabled: true,
  userPoolId: 'ap-south-1_abc',
  clientId: 'c1',
  region: 'ap-south-1',
};
const TOKENS = {
  AuthenticationResult: { IdToken: 'id', AccessToken: 'ac', RefreshToken: 'rf', ExpiresIn: 3600 },
};

interface World {
  cognito: { target: string; body: Record<string, unknown> }[];
  api: { method: string; body?: string }[];
  saved: { profile: Record<string, string>; updatedAt: string } | null;
  cognitoReplies: Record<string, { ok: boolean; body?: unknown }>;
  authConfig: unknown;
}

const world = (): { w: World; fetchImpl: typeof fetch } => {
  const w: World = { cognito: [], api: [], saved: null, cognitoReplies: {}, authConfig: CONFIG };
  const fetchImpl = ((url: string, init?: RequestInit) => {
    const json = (ok: boolean, body: unknown): Promise<Response> =>
      Promise.resolve({
        ok,
        status: ok ? 200 : 400,
        json: () => Promise.resolve(body),
      } as Response);
    if (url.includes('cognito-idp')) {
      const target =
        ((init?.headers as Record<string, string>)['x-amz-target'] ?? '').split('.').pop() ?? '';
      w.cognito.push({ target, body: JSON.parse(init?.body as string) as Record<string, unknown> });
      const reply = w.cognitoReplies[target];
      return reply === undefined ? json(true, {}) : json(reply.ok, reply.body ?? {});
    }
    if (url.endsWith('/v1/auth-config')) return json(true, w.authConfig);
    if (url.endsWith('/v1/me')) {
      const method = init?.method ?? 'GET';
      w.api.push({ method, ...(init?.body === undefined ? {} : { body: init.body as string }) });
      if (method === 'GET') return json(true, w.saved ?? { profile: null });
      if (method === 'PUT') {
        w.saved = {
          profile: (JSON.parse(init?.body as string) as { profile: Record<string, string> })
            .profile,
          updatedAt: '2026-10-12T10:30:00.000Z',
        };
        return json(true, w.saved);
      }
      w.saved = null;
      return json(true, { deleted: true });
    }
    return json(false, {});
  }) as typeof fetch;
  return { w, fetchImpl };
};

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const Probe = (): React.JSX.Element => {
  const account = useAccount();
  return (
    <p>
      {account.enabled
        ? `in as ${account.email ?? ''}`
        : account.guest
          ? 'as a guest'
          : 'no accounts'}
    </p>
  );
};

const open = (
  fetchImpl: typeof fetch,
  extra: { reload?: () => void; onTry?: () => void; guestAllowed?: boolean } = {},
): void => {
  render(
    <MemoryRouter>
      <AccountGate fetchImpl={fetchImpl} apiUrl="" {...extra}>
        <Probe />
        <AccountScreen />
      </AccountGate>
    </MemoryRouter>,
  );
};

describe('the door to the app', () => {
  it('opens the app as it always was where accounts are not set up', async () => {
    const { w, fetchImpl } = world();
    w.authConfig = { enabled: false };
    open(fetchImpl);
    expect(await screen.findByText('no accounts')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('shows a visitor who is not signed in sign in, create an account, and try without login', async () => {
    const { fetchImpl } = world();
    const onTry = vi.fn();
    open(fetchImpl, { onTry });
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create an account' })).toBeInTheDocument();
    expect(screen.queryByText(/in as/u)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try without login' }));
    expect(onTry).toHaveBeenCalledOnce();
  });

  it('signs a person in, keeps the session, and gives a new account what the device already holds', async () => {
    const { w, fetchImpl } = world();
    w.cognitoReplies.InitiateAuth = { ok: true, body: TOKENS };
    window.localStorage.setItem('vayu.pins.v1', '[{"name":"Home"}]');
    open(fetchImpl);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.org');
    await userEvent.type(screen.getByLabelText('Password'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('in as asha@example.org')).toBeInTheDocument();
    expect(window.localStorage.getItem(SESSION_KEY)).toContain('asha@example.org');
    expect(w.saved?.profile['vayu.pins.v1']).toBe('[{"name":"Home"}]');
    expect(await screen.findByText(/Saved to your account/u)).toBeInTheDocument();
  });

  it('says in words when the email and password do not match, and does not sign in', async () => {
    const { w, fetchImpl } = world();
    w.cognitoReplies.InitiateAuth = { ok: false, body: { __type: 'NotAuthorizedException' } };
    open(fetchImpl);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.org');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/u);
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('creates an account, asks for the emailed code, confirms it and signs in', async () => {
    const { w, fetchImpl } = world();
    w.cognitoReplies.InitiateAuth = { ok: true, body: TOKENS };
    open(fetchImpl);
    await userEvent.click(await screen.findByRole('button', { name: 'Create an account' }));
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.org');
    await userEvent.type(screen.getByLabelText(/^Password/u), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await userEvent.type(await screen.findByLabelText('The code we emailed you'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('in as new@example.org')).toBeInTheDocument();
    expect(w.cognito.map((c) => c.target)).toEqual(['SignUp', 'ConfirmSignUp', 'InitiateAuth']);
  });

  it("takes the account's places on a device that held others, and reloads", async () => {
    const { w, fetchImpl } = world();
    w.saved = { profile: { 'vayu.pins.v1': 'from the account' }, updatedAt: 't1' };
    window.localStorage.setItem('vayu.pins.v1', 'on this device');
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        email: 'asha@example.org',
        tokens: {
          idToken: 'id',
          accessToken: 'ac',
          refreshToken: 'rf',
          expiresAt: Date.now() + 3_600_000,
        },
      }),
    );
    const reload = vi.fn();
    open(fetchImpl, { reload });
    await waitFor(() => {
      expect(reload).toHaveBeenCalledOnce();
    });
    expect(window.localStorage.getItem('vayu.pins.v1')).toBe('from the account');
  });
});

describe('the account page', () => {
  const signedIn = (): void => {
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        email: 'asha@example.org',
        tokens: {
          idToken: 'id',
          accessToken: 'ac',
          refreshToken: 'rf',
          expiresAt: Date.now() + 3_600_000,
        },
      }),
    );
  };

  it('signs out: the places leave this device, the sign-in ends, and the page reloads', async () => {
    const { w, fetchImpl } = world();
    w.saved = { profile: { 'vayu.pins.v1': 'x' }, updatedAt: 't1' };
    window.localStorage.setItem('vayu.pins.v1', 'x');
    signedIn();
    const reload = vi.fn();
    open(fetchImpl, { reload });
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(reload).toHaveBeenCalled();
    });
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem('vayu.pins.v1')).toBeNull();
    expect(w.cognito.map((c) => c.target)).toContain('GlobalSignOut');
    // The copy in the account is kept: signing out is not deleting.
    expect(w.saved).not.toBeNull();
  });

  it('asks twice before deleting, then deletes the saved copy and the account', async () => {
    const { w, fetchImpl } = world();
    w.saved = { profile: { 'vayu.pins.v1': 'x' }, updatedAt: 't1' };
    window.localStorage.setItem('vayu.pins.v1', 'x');
    signedIn();
    const reload = vi.fn();
    open(fetchImpl, { reload });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete my account' }));
    expect(w.cognito.map((c) => c.target)).not.toContain('DeleteUser');
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    await waitFor(() => {
      expect(reload).toHaveBeenCalled();
    });
    expect(w.saved).toBeNull();
    expect(w.cognito.map((c) => c.target)).toContain('DeleteUser');
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('can be backed out of', async () => {
    const { fetchImpl } = world();
    signedIn();
    open(fetchImpl);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete my account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeInTheDocument();
  });
});

describe('using the app as a guest', () => {
  const GUEST_KEY = 'vayu.guest.v1';

  it('offers it only where it is allowed, never in the website', async () => {
    const { fetchImpl } = world();
    open(fetchImpl);
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue as guest' })).not.toBeInTheDocument();
  });

  it('opens the live app with nothing saved to an account, and remembers the choice', async () => {
    const { w, fetchImpl } = world();
    open(fetchImpl, { guestAllowed: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Continue as guest' }));
    expect(await screen.findByText('as a guest')).toBeInTheDocument();
    expect(window.localStorage.getItem(GUEST_KEY)).toBe('1');
    expect(w.api).toEqual([]);
    expect(w.cognito).toEqual([]);
  });

  it('goes straight to the app next time, without the welcome screen', async () => {
    const { fetchImpl } = world();
    window.localStorage.setItem(GUEST_KEY, '1');
    open(fetchImpl, { guestAllowed: true });
    expect(await screen.findByText('as a guest')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('asks again when the phone had no network the first time, rather than skipping the welcome screen', async () => {
    const { fetchImpl: inner } = world();
    let misses = 2;
    const flaky = ((url: string, init?: RequestInit) =>
      url.endsWith('/v1/auth-config') && misses-- > 0
        ? Promise.reject(new TypeError('Failed to fetch'))
        : inner(url, init)) as typeof fetch;
    open(flaky, { guestAllowed: true });
    expect(
      await screen.findByRole('button', { name: 'Sign in' }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('ignores a remembered guest choice where guests are not allowed', async () => {
    const { fetchImpl } = world();
    window.localStorage.setItem(GUEST_KEY, '1');
    open(fetchImpl);
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('as a guest')).not.toBeInTheDocument();
  });

  it('says on the account page that places stay on the phone, and lets the guest sign in or create an account', async () => {
    const { fetchImpl } = world();
    window.localStorage.setItem(GUEST_KEY, '1');
    open(fetchImpl, { guestAllowed: true });
    expect(await screen.findByText(/using Vayu as a guest/u)).toBeInTheDocument();
    expect(screen.getByText(/stay on this phone/u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in or create an account' }));
    expect(await screen.findByRole('button', { name: 'Create an account' })).toBeInTheDocument();
    expect(window.localStorage.getItem(GUEST_KEY)).toBeNull();
  });

  it('stops being a guest once signed in, so signing out later shows the welcome screen', async () => {
    const { w, fetchImpl } = world();
    w.cognitoReplies.InitiateAuth = { ok: true, body: TOKENS };
    window.localStorage.setItem(GUEST_KEY, '1');
    open(fetchImpl, { guestAllowed: true });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign in or create an account' }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.org');
    await userEvent.type(screen.getByLabelText('Password'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('in as asha@example.org')).toBeInTheDocument();
    expect(window.localStorage.getItem(GUEST_KEY)).toBeNull();
  });
});

describe('where the device has been', () => {
  it('is forgotten on sign-out, so the next visit does not open on the last one’s location', async () => {
    const { w, fetchImpl } = world();
    w.saved = { profile: { 'vayu.pins.v1': 'x' }, updatedAt: 't1' };
    window.localStorage.setItem('vayu.pins.v1', 'x');
    window.localStorage.setItem('vayu.liveLocation.v1', 'on');
    window.localStorage.setItem('vayu.live.v1', '[{"lat":28.6,"lng":77.2}]');
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        email: 'asha@example.org',
        tokens: {
          idToken: 'id',
          accessToken: 'ac',
          refreshToken: 'rf',
          expiresAt: Date.now() + 3_600_000,
        },
      }),
    );
    open(fetchImpl, { reload: vi.fn() });
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
    });
    expect(window.localStorage.getItem('vayu.liveLocation.v1')).toBeNull();
    expect(window.localStorage.getItem('vayu.live.v1')).toBeNull();
  });

  it('is not carried from a guest visit into a new sign-in', async () => {
    const { fetchImpl } = world();
    window.localStorage.setItem('vayu.guest.v1', '1');
    window.localStorage.setItem('vayu.liveLocation.v1', 'on');
    window.localStorage.setItem('vayu.live.v1', '[{"lat":28.6,"lng":77.2}]');
    open(fetchImpl, { guestAllowed: true });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign in or create an account' }),
    );
    expect(window.localStorage.getItem('vayu.liveLocation.v1')).toBeNull();
    expect(window.localStorage.getItem('vayu.live.v1')).toBeNull();
  });
});
