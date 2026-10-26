import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccount } from '../account/AccountContext';
import { API_URL } from '../config';
import {
  createAdminApi,
  type AccountRow,
  type AdminApi,
  type DayStats,
  type DaySummary,
  type ErrorRow,
  type GroupBy,
  type GroupRow,
} from './adminApi';

type Tab = 'overview' | 'groups' | 'accounts' | 'errors';
const TABS: readonly (readonly [Tab, string])[] = [
  ['overview', 'Overview'],
  ['groups', 'Groups'],
  ['accounts', 'Accounts'],
  ['errors', 'Errors'],
];
const GROUPS: readonly (readonly [GroupBy, string])[] = [
  ['platform', 'Platform'],
  ['version', 'App version'],
  ['region', 'City'],
  ['auth', 'Signed in'],
  ['visitor', 'New or returning'],
];
const RANGES = [7, 14, 30] as const;

const minutes = (seconds: number): string => (seconds / 60).toFixed(1);
const topFeatures = (stats: DayStats, count = 5): string =>
  Object.entries(stats.features)
    .filter(([name]) => name.startsWith('feature:'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([name, n]) => `${name.slice(8).replace(/_/gu, ' ')} ${String(n)}`)
    .join(', ') || '—';

/** Just for the two owners. Anyone else is sent back to the home screen, and the server refuses them anyway. */
export function AdminScreen({ api }: { readonly api?: AdminApi }): React.JSX.Element | null {
  const account = useAccount();
  const navigate = useNavigate();
  const real = useMemo(
    () => (api !== undefined || account.idToken === undefined ? api : createAdminApi(API_URL, account.idToken)),
    [api, account.idToken],
  );
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    if (real === undefined) {
      navigate('/', { replace: true });
      return;
    }
    let current = true;
    real.whoami().then(
      () => {
        if (current) setReady(true);
      },
      () => {
        if (current) navigate('/', { replace: true });
      },
    );
    return () => {
      current = false;
    };
  }, [real, navigate]);

  if (!ready || real === undefined) return null;
  return (
    <div className="page">
      <header className="place">
        <Link to="/" className="back">
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" /> My Air
        </Link>
        <h1>Admin</h1>
      </header>
      <main className="layout admin">
        <div className="segmented" role="group" aria-label="Admin sections">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => {
                setTab(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'overview' && <Overview api={real} />}
        {tab === 'groups' && <Groups api={real} />}
        {tab === 'accounts' && <Accounts api={real} />}
        {tab === 'errors' && <Errors api={real} />}
      </main>
    </div>
  );
}

function useLoaded<T>(load: () => Promise<T>, deps: readonly unknown[]): T | 'failed' | undefined {
  const [value, setValue] = useState<T | 'failed' | undefined>(undefined);
  useEffect(() => {
    let current = true;
    setValue(undefined);
    load().then(
      (v) => {
        if (current) setValue(v);
      },
      () => {
        if (current) setValue('failed');
      },
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

const Status = ({ value }: { readonly value: unknown }): React.JSX.Element | null =>
  value === undefined ? (
    <p className="muted">Loading…</p>
  ) : value === 'failed' ? (
    <p className="muted">Could not load this just now.</p>
  ) : null;

function Overview({ api }: { readonly api: AdminApi }): React.JSX.Element {
  const days = useLoaded(() => api.summary(14), [api]);
  if (days === undefined || days === 'failed') return <Status value={days} />;
  const today: DaySummary | undefined = days[days.length - 1];
  const most = Math.max(1, ...days.map((d) => d.sessions));
  return (
    <>
      <section className="card admin-stats" aria-label="Today">
        <h2>Today</h2>
        <dl>
          <div>
            <dt>People</dt>
            <dd>{today?.users ?? 0}</dd>
          </div>
          <div>
            <dt>Sessions</dt>
            <dd>{today?.sessions ?? 0}</dd>
          </div>
          <div>
            <dt>Minutes in app</dt>
            <dd>{minutes(today?.activeSeconds ?? 0)}</dd>
          </div>
          <div>
            <dt>Errors</dt>
            <dd>{today?.errors ?? 0}</dd>
          </div>
        </dl>
        <p className="muted small">Top features: {today === undefined ? '—' : topFeatures(today)}</p>
      </section>
      <section className="card" aria-label="Last 14 days">
        <h2>Last 14 days</h2>
        <ol className="admin-bars">
          {days.map((d) => (
            <li key={d.day}>
              <span className="muted small">{d.day.slice(5)}</span>
              <span className="admin-bar" style={{ width: `${String((d.sessions / most) * 100)}%` }} />
              <span className="small">
                {d.sessions} sessions, {d.users} people
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function Groups({ api }: { readonly api: AdminApi }): React.JSX.Element {
  const [by, setBy] = useState<GroupBy>('platform');
  const [range, setRange] = useState<number>(14);
  const rows = useLoaded<readonly GroupRow[]>(() => api.groups(by, range), [api, by, range]);
  return (
    <section className="card" aria-label="Groups">
      <h2>Groups</h2>
      <div className="segmented" role="group" aria-label="Group by">
        {GROUPS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={by === id}
            onClick={() => {
              setBy(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Days">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            onClick={() => {
              setRange(r);
            }}
          >
            {r} days
          </button>
        ))}
      </div>
      <Status value={rows} />
      {Array.isArray(rows) && (
        <div className="admin-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Group</th>
                <th>Sessions</th>
                <th>People-days</th>
                <th>Min/session</th>
                <th>Errors</th>
                <th>Top features</th>
              </tr>
            </thead>
            <tbody>
              {(rows as readonly GroupRow[]).map((r) => (
                <tr key={r.value}>
                  <td>{r.value}</td>
                  <td>{r.sessions}</td>
                  <td>{r.users}</td>
                  <td>{r.sessions === 0 ? '—' : minutes(r.activeSeconds / r.sessions)}</td>
                  <td>{r.errors}</td>
                  <td>{topFeatures(r, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        People-days adds up the people active each day, so one person on two days counts twice.
      </p>
    </section>
  );
}

function Accounts({ api }: { readonly api: AdminApi }): React.JSX.Element {
  const [open, setOpen] = useState<string | undefined>(undefined);
  const users = useLoaded<readonly AccountRow[]>(() => api.users(), [api]);
  if (open !== undefined) return <AccountDetail api={api} id={open} back={() => { setOpen(undefined); }} />;
  return (
    <section className="card" aria-label="Accounts">
      <h2>Signed-in accounts</h2>
      <Status value={users} />
      {Array.isArray(users) && users.length === 0 && <p className="muted">No signed-in accounts yet.</p>}
      <ul className="admin-list">
        {Array.isArray(users) &&
          (users as readonly AccountRow[]).map((u) => (
            <li key={u.userId}>
              <button
                type="button"
                className="match"
                onClick={() => {
                  setOpen(u.userId);
                }}
              >
                <span className="match-text">
                  <strong>{u.email}</strong>
                  <span className="muted small">
                    {u.platform} {u.appVersion} · {u.region} · {u.sessions} sessions · last seen{' '}
                    {u.lastSeen.slice(0, 16).replace('T', ' ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
      </ul>
    </section>
  );
}

function AccountDetail({
  api,
  id,
  back,
}: {
  readonly api: AdminApi;
  readonly id: string;
  readonly back: () => void;
}): React.JSX.Element {
  const found = useLoaded(() => api.user(id), [api, id]);
  return (
    <section className="card" aria-label="Account">
      <button type="button" className="back" onClick={back}>
        <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" /> All accounts
      </button>
      <Status value={found} />
      {found !== undefined && found !== 'failed' && (
        <>
          <h2>{found.user.email}</h2>
          <p className="muted small">
            {found.user.platform} {found.user.appVersion} · {found.user.region} · first seen{' '}
            {found.user.firstSeen.slice(0, 10)} · first place added{' '}
            {found.user.firstPlaceAt === undefined ? 'not yet' : found.user.firstPlaceAt.slice(0, 10)}
          </p>
          <ol className="admin-timeline">
            {(found.events).map((e, i) => (
              <li key={`${e.at}-${String(i)}`}>
                <span className="muted small">{e.at.slice(0, 16).replace('T', ' ')}</span>{' '}
                {e.kind}
                {e.detail === '' ? '' : `: ${e.detail}`}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function Errors({ api }: { readonly api: AdminApi }): React.JSX.Element {
  const errors = useLoaded<readonly ErrorRow[]>(() => api.errors(), [api]);
  return (
    <section className="card" aria-label="Errors">
      <h2>Recent errors</h2>
      <Status value={errors} />
      {Array.isArray(errors) && errors.length === 0 && <p className="muted">No errors recorded.</p>}
      <ul className="admin-list">
        {Array.isArray(errors) &&
          (errors as readonly ErrorRow[]).map((e, i) => (
            <li key={`${e.at}-${String(i)}`}>
              <strong>{e.detail}</strong>
              <span className="muted small">
                {' '}
                {e.platform} {e.appVersion} · {e.region} · {e.at.slice(0, 16).replace('T', ' ')}
              </span>
            </li>
          ))}
      </ul>
    </section>
  );
}
