// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, type CognitoClient } from '../account/cognito';
import { Welcome } from '../account/Welcome';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('./index', () => ({ track, noteAir: () => undefined, startAnalytics: () => undefined }));

beforeEach(() => {
  track.mockReset();
});
afterEach(cleanup);

const TOKENS = { idToken: 'id', accessToken: 'ac', refreshToken: 'rf', expiresAt: Date.now() + 3_600_000 };

const clientWith = (over: Partial<Record<keyof CognitoClient, unknown>> = {}): CognitoClient =>
  ({
    signIn: vi.fn(() => Promise.resolve(TOKENS)),
    signUp: vi.fn(() => Promise.resolve()),
    confirmSignUp: vi.fn(() => Promise.resolve()),
    resendCode: vi.fn(() => Promise.resolve()),
    ...over,
  }) as unknown as CognitoClient;

const steps = (): string[] =>
  track.mock.calls.map((c) => `${String(c[0])}:${String(c[1])}`);

const show = (client: CognitoClient, onGuest?: () => void): { signedIn: ReturnType<typeof vi.fn> } => {
  const signedIn = vi.fn();
  render(
    <StrictMode>
      <Welcome client={client} onSignedIn={signedIn} holdsData={false} {...(onGuest ? { onGuest } : {})} />
    </StrictMode>,
  );
  return { signedIn };
};

describe('the welcome screen reports each step of the way in', () => {
  it('counts the screen once, even where React runs effects twice', () => {
    show(clientWith());
    expect(steps().filter((s) => s === 'screen:welcome')).toHaveLength(1);
  });

  it('counts opening each form, but nothing of what is typed', async () => {
    show(clientWith());
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await userEvent.type(screen.getByLabelText('Email'), 'private@example.com');
    expect(steps()).toContain('feature:welcome_signin_start');
    expect(JSON.stringify(track.mock.calls)).not.toContain('private');
  });

  it('follows sign up, the emailed code, confirming and signing in', async () => {
    const { signedIn } = show(clientWith());
    await userEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    await userEvent.type(screen.getByLabelText('Email'), 'a@example.com');
    await userEvent.type(screen.getByLabelText(/^Password/u), 'abcdefg1');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText(/Confirm your email/u);
    await userEvent.type(screen.getByLabelText(/code we emailed/u), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await vi.waitFor(() => {
      expect(signedIn).toHaveBeenCalled();
    });
    const seen = steps();
    expect(seen).toEqual(
      expect.arrayContaining([
        'feature:welcome_signup_start',
        'feature:welcome_code_step',
        'feature:welcome_confirmed',
        'feature:welcome_signed_in',
      ]),
    );
    expect(seen.indexOf('feature:welcome_code_step')).toBeLessThan(seen.indexOf('feature:welcome_confirmed'));
    expect(seen.indexOf('feature:welcome_confirmed')).toBeLessThan(seen.indexOf('feature:welcome_signed_in'));
  });

  it('counts a step that fails, and does not count it as signed in', async () => {
    const client = clientWith({
      signIn: vi.fn(() => Promise.reject(new AuthError('bad_login', 'Wrong email or password.'))),
    });
    show(client);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await userEvent.type(screen.getByLabelText('Email'), 'a@example.com');
    await userEvent.type(screen.getByLabelText(/^Password/u), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Wrong email or password.');
    expect(steps()).toContain('feature:welcome_failed');
    expect(steps()).not.toContain('feature:welcome_signed_in');
  });

  it('counts continuing as a guest', async () => {
    const onGuest = vi.fn();
    show(clientWith(), onGuest);
    await userEvent.click(screen.getByRole('button', { name: 'Continue as guest' }));
    expect(steps()).toContain('feature:welcome_guest');
    expect(onGuest).toHaveBeenCalled();
  });
});
