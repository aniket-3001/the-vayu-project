import { useEffect, useState } from 'react';
import { APP_VERSION } from '../analytics/device';
import { isNative } from './splash';

/** True when `version` is older than `minimum`. Compares dotted numbers ("0.9.0" is older than "0.10.0"); anything else is not older. */
export function isOlder(version: string, minimum: string): boolean {
  const parse = (text: string): number[] | undefined => {
    const parts = text.trim().split('.');
    const numbers = parts.map((part) => (/^\d{1,6}$/u.test(part) ? Number(part) : Number.NaN));
    return numbers.length > 0 && numbers.every((n) => Number.isFinite(n)) ? numbers : undefined;
  };
  const a = parse(version);
  const b = parse(minimum);
  if (a === undefined || b === undefined) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

type Fetch = typeof fetch;

/**
 * Asks the API for the oldest app version it still supports. Any trouble (no network, a strange answer) reads as "no
 * limit", so a person is never locked out of the app by a failure of this check.
 */
export async function minimumVersion(
  apiUrl: string,
  fetchImpl: Fetch = fetch,
): Promise<string | undefined> {
  try {
    const res = await fetchImpl(`${apiUrl.replace(/\/$/u, '')}/v1/app-config`);
    if (!res.ok) return undefined;
    const body = (await res.json()) as { minAppVersion?: unknown };
    return typeof body.minAppVersion === 'string' ? body.minAppVersion : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Stops an out-of-date phone app with one plain screen, once the server has said this version is no longer supported.
 * It applies only to the phone apps: the website is always the latest. Everything else passes through untouched.
 */
export function UpdateGate({
  apiUrl,
  children,
  native = isNative(),
  version = APP_VERSION,
  fetchImpl = fetch,
}: {
  readonly apiUrl: string;
  readonly children: React.ReactNode;
  readonly native?: boolean;
  readonly version?: string;
  readonly fetchImpl?: Fetch;
}): React.JSX.Element {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (!native) return undefined;
    let current = true;
    void minimumVersion(apiUrl, fetchImpl).then((minimum) => {
      if (current && minimum !== undefined && isOlder(version, minimum)) setOutdated(true);
    });
    return () => {
      current = false;
    };
  }, [apiUrl, fetchImpl, native, version]);

  if (!outdated) return <>{children}</>;
  return (
    <main className="welcome" aria-labelledby="update-title">
      <h1 id="update-title">Update Vayu</h1>
      <p className="welcome-lead">
        This version of the app is out of date and can no longer give you a reliable answer. Update
        it from the App Store or Google Play, then open it again.
      </p>
    </main>
  );
}
