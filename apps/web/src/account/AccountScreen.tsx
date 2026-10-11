import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clock12 } from '../today/time';
import { useAccount } from './AccountContext';

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
        {!account.enabled ? (
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
      </main>
    </div>
  );
}
