import { useState } from 'react';
import { AuthError, type CognitoClient } from './cognito';
import type { Session } from './session';

type View = 'start' | 'signin' | 'signup' | 'confirm' | 'forgot' | 'reset';

/** The recorded days start from their own address, so they are reached by loading the page there. */
const tryWithoutLogin = (): void => {
  window.location.hash = '#/week';
  window.location.reload();
};

/**
 * What a signed-out visitor sees: the one-line promise, a way in, and a way to look around first. Small on purpose:
 * email and password, a code by email to confirm, and a code by email to reset a forgotten password.
 */
export function Welcome({
  client,
  onSignedIn,
  holdsData,
  onTry = tryWithoutLogin,
}: {
  readonly client: CognitoClient;
  readonly onSignedIn: (session: Session) => void;
  /** Whether this device holds places or a family from before, which signing in will replace. */
  readonly holdsData: boolean;
  /** Opens the recorded days. Loading the page at that address is the default. */
  readonly onTry?: () => void;
}): React.JSX.Element {
  const [view, setView] = useState<View>('start');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [note, setNote] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const go = (next: View): void => {
    setView(next);
    setProblem(undefined);
    setNote(undefined);
    setCode('');
  };

  /** Runs one step: shows the words of a failure, and lets the step say where to go if it needs a code. */
  const run = (step: () => Promise<void>, onError?: (error: AuthError) => boolean): void => {
    setBusy(true);
    setProblem(undefined);
    step().then(
      () => {
        setBusy(false);
      },
      (error: unknown) => {
        setBusy(false);
        const failure =
          error instanceof AuthError
            ? error
            : new AuthError('failed', 'Something went wrong. Try again in a moment.');
        if (onError?.(failure) !== true) setProblem(failure.message);
      },
    );
  };

  const signIn = async (): Promise<void> => {
    const tokens = await client.signIn(email.trim(), password);
    onSignedIn({ email: email.trim(), tokens });
  };

  const emailField = (
    <label className="field">
      <span>Email</span>
      <input
        type="email"
        value={email}
        autoComplete="email"
        inputMode="email"
        required
        onChange={(event) => {
          setEmail(event.target.value);
        }}
      />
    </label>
  );
  const passwordField = (label: string, autoComplete: string): React.JSX.Element => (
    <label className="field">
      <span>{label}</span>
      <input
        type="password"
        value={password}
        autoComplete={autoComplete}
        required
        onChange={(event) => {
          setPassword(event.target.value);
        }}
      />
    </label>
  );
  const codeField = (
    <label className="field">
      <span>The code we emailed you</span>
      <input
        value={code}
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        onChange={(event) => {
          setCode(event.target.value);
        }}
      />
    </label>
  );
  const message = (
    <>
      {problem !== undefined && (
        <p className="banner" role="alert">
          {problem}
        </p>
      )}
      {note !== undefined && (
        <p className="gate-note-inline" role="status">
          {note}
        </p>
      )}
    </>
  );

  return (
    <main className="welcome" aria-labelledby="welcome-title">
      <h1 id="welcome-title">The Vayu Project</h1>
      <p className="welcome-lead">One clear answer for the air at the places you care about.</p>

      {view === 'start' && (
        <div className="welcome-actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              go('signin');
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className="plain"
            onClick={() => {
              go('signup');
            }}
          >
            Create an account
          </button>
          <p className="muted small">
            An account saves your places and family, so they follow you to any phone or laptop.
          </p>
        </div>
      )}

      {view === 'signin' && (
        <form
          className="welcome-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(signIn, (error) => {
              if (error.code !== 'UserNotConfirmedException') return false;
              // An account made but never confirmed: send a new code and ask for it.
              void client.resendCode(email.trim()).catch(() => undefined);
              setNote('We emailed you a new code.');
              setView('confirm');
              return true;
            });
          }}
        >
          <h2>Sign in</h2>
          {emailField}
          {passwordField('Password', 'current-password')}
          {message}
          {holdsData && (
            <p className="muted small">
              Signing in replaces the places saved on this device with the ones in your account.
            </p>
          )}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              go('forgot');
            }}
          >
            Forgot your password?
          </button>
        </form>
      )}

      {view === 'signup' && (
        <form
          className="welcome-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              await client.signUp(email.trim(), password);
              setNote('We emailed you a code.');
              setView('confirm');
            });
          }}
        >
          <h2>Create an account</h2>
          {emailField}
          {passwordField('Password (8 or more, with a letter and a number)', 'new-password')}
          {message}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
      )}

      {view === 'confirm' && (
        <form
          className="welcome-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              await client.confirmSignUp(email.trim(), code.trim());
              await signIn();
            });
          }}
        >
          <h2>Confirm your email</h2>
          <p className="muted small">We sent a code to {email.trim()}. It can take a minute.</p>
          {codeField}
          {message}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Confirming…' : 'Confirm'}
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              run(async () => {
                await client.resendCode(email.trim());
                setNote('We emailed you a new code.');
              });
            }}
          >
            Send a new code
          </button>
        </form>
      )}

      {view === 'forgot' && (
        <form
          className="welcome-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              await client.forgotPassword(email.trim());
              setNote('If that email has an account, we sent a code.');
              setView('reset');
            });
          }}
        >
          <h2>Reset your password</h2>
          {emailField}
          {message}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send a code'}
          </button>
        </form>
      )}

      {view === 'reset' && (
        <form
          className="welcome-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              await client.confirmForgotPassword(email.trim(), code.trim(), password);
              await signIn();
            });
          }}
        >
          <h2>Choose a new password</h2>
          {codeField}
          {passwordField('New password (8 or more, with a letter and a number)', 'new-password')}
          {message}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save and sign in'}
          </button>
        </form>
      )}

      {view !== 'start' && (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            go('start');
          }}
        >
          Back
        </button>
      )}

      <div className="welcome-guest">
        <button type="button" className="plain guest" onClick={onTry}>
          Try without login
        </button>
        <p className="muted small">
          Seven real past days from the public archives, played through the same app. Nothing is
          saved.
        </p>
      </div>
    </main>
  );
}
