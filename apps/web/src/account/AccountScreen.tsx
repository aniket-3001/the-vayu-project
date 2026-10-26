import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildLabel } from '../build';
import { clock12 } from '../today/time';
import { chooseTheme, loadChoice, type ThemeChoice } from '../theme/theme';
import { useAccount } from './AccountContext';

const LOOKS: readonly { readonly choice: ThemeChoice; readonly label: string }[] = [
  { choice: 'system', label: 'Match my phone' },
  { choice: 'light', label: 'Light' },
  { choice: 'dark', label: 'Dark' },
];

/** Light, dark, or whatever the phone is set to; kept on this device only. */
function Appearance(): React.JSX.Element {
  const [look, setLook] = useState<ThemeChoice>(() => loadChoice());
  return (
    <section className="card account-card" aria-label="Appearance">
      <p>Appearance</p>
      <div className="segmented" role="group" aria-label="Appearance">
        {LOOKS.map((item) => (
          <button
            key={item.choice}
            type="button"
            aria-pressed={look === item.choice}
            onClick={() => {
              chooseTheme(item.choice);
              setLook(item.choice);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * A way into the admin panel, shown only once the server says this person is an admin. The phone app has no address
 * bar to type `/#/admin` into, and nobody else is ever shown it (the server refuses them anyway).
 */
function AdminLink(): React.JSX.Element | null {
  const { isAdmin, email } = useAccount();
  const ask = useRef(isAdmin);
  ask.current = isAdmin;
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let current = true;
    setAdmin(false);
    void ask.current?.().then((yes) => {
      if (current) setAdmin(yes);
    });
    return () => {
      current = false;
    };
  }, [email]);
  if (!admin) return null;
  return (
    <section className="card account-card" aria-label="Admin">
      <p>Admin</p>
      <Link to="/admin" className="primary-link">
        Open the admin panel
      </Link>
    </section>
  );
}

/** Where a signed-in person sees that their places are saved, signs out, or deletes the account. */
export function AccountScreen(): React.JSX.Element {
  const account = useAccount();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  const run = (step: () => Promise<void>): void => {
    setBusy(true);
    setProblem(undefined);
    step().catch((error: unknown) => {
      setBusy(false);
      setProblem(
        error instanceof Error ? error.message : 'Something went wrong. Try again in a moment.',
      );
    });
  };

  const saved =
    account.status.state === 'error'
      ? 'Could not save just now. Your places are safe on this device, and we will try again.'
      : account.status.state === 'saving'
        ? 'Saving…'
        : account.status.savedAt === undefined
          ? 'Saved to your account.'
          : `Saved to your account at ${clock12(account.status.savedAt)}.`;

  return (
    <div className="page">
      <header className="place">
        <Link to="/" className="back">
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" /> My Air
        </Link>
        <h1>Account</h1>
      </header>
      <main className="layout account-page">
        {account.guest ? (
          <section className="card account-card" aria-label="Guest">
            <p>You’re using Vayu as a guest.</p>
            <p className="muted small">
              Your places, family and outdoor time stay on this phone and are never sent anywhere.
              If you delete the app or clear its data, they are gone.
            </p>
            <div className="account-actions">
              <button type="button" className="primary" onClick={account.leaveGuest}>
                Sign in or create an account
              </button>
            </div>
          </section>
        ) : !account.enabled ? (
          <p className="empty">Accounts are not switched on here.</p>
        ) : (
          <section className="card account-card" aria-label="Your account">
            <p>
              Signed in as <strong>{account.email}</strong>
            </p>
            <p className="muted" role="status">
              {saved}
            </p>
            <p className="muted small">
              Your places, family and outdoor time are saved to your account and follow you to any
              device you sign in on. Signing out removes them from this device.
            </p>
            {problem !== undefined && (
              <p className="banner" role="alert">
                {problem}
              </p>
            )}
            <div className="account-actions">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => {
                  run(account.signOut);
                }}
              >
                Sign out
              </button>
              {!sure ? (
                <button
                  type="button"
                  className="plain"
                  disabled={busy}
                  onClick={() => {
                    setSure(true);
                  }}
                >
                  Delete my account
                </button>
              ) : (
                <div className="account-sure" role="group" aria-label="Delete my account">
                  <p>This deletes your account and everything saved to it. It cannot be undone.</p>
                  <button
                    type="button"
                    className="plain danger"
                    disabled={busy}
                    onClick={() => {
                      run(account.deleteAccount);
                    }}
                  >
                    Yes, delete it
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setSure(false);
                    }}
                  >
                    Keep it
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
        <AdminLink />
        <Appearance />
        <p className="muted small build-note">{buildLabel()}</p>
      </main>
    </div>
  );
}
