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
  type JourneyCohort,
  type Rate,
} from './adminApi';

type Tab = 'overview' | 'journey' | 'groups' | 'accounts' | 'errors';
const TABS: readonly (readonly [Tab, string])[] = [
  ['overview', 'Overview'],
  ['journey', 'Journey'],
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
  ['band', 'AQI band'],
];
/** The AQI bands in order, so their rows read from best air to worst, whatever their counts. */
const BAND_ORDER = ['good', 'moderate', 'sensitive', 'unhealthy', 'very_bad', 'hazardous'];
const BAND_NOTE =
  'For AQI band, Sessions are the sessions that saw that band, and the other columns are what happened while it was showing.';

/** The milestones, in the order they are shown, with short column names. */
const MILESTONE_LABELS: readonly (readonly [string, string])[] = [
  ['first_place', 'Added a place'],
  ['first_search', 'Searched'],
  ['first_detect', 'Detected location'],
  ['first_lens', 'AIR Lens'],
  ['first_exposure', 'Exposure'],
  ['first_map', 'Map'],
  ['first_assistant', 'Assistant'],
  ['first_unit', 'Connected a unit'],
  ['first_signed_in', 'Signed in'],
];
/** The welcome screen's steps, in order, and the ways around it. */
const FUNNEL: readonly (readonly [string, string])[] = [
  ['screen:welcome', 'Welcome screen shown'],
  ['feature:welcome_signin_start', 'Opened sign in'],
  ['feature:welcome_signup_start', 'Opened create account'],
  ['feature:welcome_code_step', 'Reached the email code'],
  ['feature:welcome_confirmed', 'Confirmed the email'],
  ['feature:welcome_signed_in', 'Signed in'],
];
const AROUND: readonly (readonly [string, string])[] = [
  ['feature:welcome_guest', 'Continued as guest'],
  ['feature:recorded_days', 'Opened the recorded days'],
  ['feature:welcome_failed', 'A step failed'],
];
const RANGES = [7, 14, 30] as const;

const featureCount = (stats: DayStats): number =>
  Object.entries(stats.features)
    .filter(([name]) => name.startsWith('feature:'))
    .reduce((sum, [, n]) => sum + n, 0);
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
        {tab === 'journey' && <Journey api={real} />}
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

/** "38% (5 of 13)", or a dash while no one in the group is old enough to say. The counts stay, because they are small. */
const rateText = (rate: Rate): string =>
  rate.eligible === 0
    ? '—'
    : `${String(Math.round((rate.returned / rate.eligible) * 100))}% (${String(rate.returned)} of ${String(rate.eligible)})`;

const weekText = (week: string): string =>
  new Date(`${week}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Newest week first: keeps the weeks down to the oldest that has any new devices (and the newest week at least). */
function trimEmptyWeeks(cohorts: readonly JourneyCohort[]): readonly JourneyCohort[] {
  let last = 0;
  cohorts.forEach((c, i) => {
    if (c.size > 0) last = i;
  });
  return cohorts.slice(0, last + 1);
}

/** Adds the figures of every day into one count per name. */
function totals(days: readonly DaySummary[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const day of days)
    for (const [name, n] of Object.entries(day.features)) out[name] = (out[name] ?? 0) + n;
  return out;
}

/**
 * What happens to new people: who comes back, what they do first, and where visitors leave the welcome screen.
 * The numbers are small, so every percentage carries the counts behind it.
 */
function Journey({ api }: { readonly api: AdminApi }): React.JSX.Element {
  const loadedCohorts = useLoaded<readonly JourneyCohort[]>(() => api.journey(8), [api]);
  // Weeks before the first one with anyone in it are all zeros, so they are left off.
  const cohorts = Array.isArray(loadedCohorts) ? trimEmptyWeeks(loadedCohorts as readonly JourneyCohort[]) : loadedCohorts;
  const days = useLoaded<readonly DaySummary[]>(() => api.summary(30), [api]);
  const done = Array.isArray(days) ? totals(days as readonly DaySummary[]) : undefined;
  const shown = done?.['screen:welcome'] ?? 0;
  return (
    <>
      <section className="card" aria-label="Who comes back">
        <h2>Who comes back</h2>
        <p className="muted small">
          New devices by the week they first came. A figure appears once its window has fully passed.
        </p>
        <Status value={cohorts} />
        {Array.isArray(cohorts) && (
          <div className="admin-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Week of</th>
                  <th>New</th>
                  <th>Next day</th>
                  <th>Within 7 days</th>
                  <th>Within 30 days</th>
                </tr>
              </thead>
              <tbody>
                {(cohorts as readonly JourneyCohort[]).map((c) => (
                  <tr key={c.week}>
                    <td>{weekText(c.week)}</td>
                    <td>{c.size}</td>
                    <td>{rateText(c.d1)}</td>
                    <td>{rateText(c.d7)}</td>
                    <td>{rateText(c.d30)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-label="What new people do first">
        <h2>What new people do first</h2>
        <p className="muted small">How many of each week’s new devices have ever done each thing.</p>
        {Array.isArray(cohorts) && (
          <div className="admin-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Week of</th>
                  <th>New</th>
                  {MILESTONE_LABELS.map(([id, label]) => (
                    <th key={id}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(cohorts as readonly JourneyCohort[]).map((c) => (
                  <tr key={c.week}>
                    <td>{weekText(c.week)}</td>
                    <td>{c.size}</td>
                    {MILESTONE_LABELS.map(([id]) => {
                      const n = c.milestones[id] ?? 0;
                      return (
                        <td key={id}>
                          {c.size === 0 ? '—' : `${String(n)} (${String(Math.round((n / c.size) * 100))}%)`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-label="Sign-in funnel">
        <h2>Sign-in funnel</h2>
        <p className="muted small">
          The welcome screen over the last 30 days. These count steps, so one person opening a form twice counts twice.
        </p>
        <Status value={days} />
        {done !== undefined && (
          <>
            <ol className="admin-list">
              {FUNNEL.map(([id, label]) => (
                <li key={id}>
                  <span>{label}</span>{' '}
                  <strong>{done[id] ?? 0}</strong>
                  {id !== 'screen:welcome' && shown > 0 && (
                    <span className="muted small"> · {String(Math.round(((done[id] ?? 0) / shown) * 100))}% of shown</span>
                  )}
                </li>
              ))}
            </ol>
            <h3>Other ways in, and where it went wrong</h3>
            <ul className="admin-list">
              {AROUND.map(([id, label]) => (
                <li key={id}>
                  <span>{label}</span> <strong>{done[id] ?? 0}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

function Groups({ api }: { readonly api: AdminApi }): React.JSX.Element {
  const [by, setBy] = useState<GroupBy>('platform');
  const [range, setRange] = useState<number>(14);
  const loaded = useLoaded<readonly GroupRow[]>(() => api.groups(by, range), [api, by, range]);
  const rows =
    by === 'band' && Array.isArray(loaded)
      ? [...(loaded as readonly GroupRow[])].sort(
          (a, b) => BAND_ORDER.indexOf(a.value) - BAND_ORDER.indexOf(b.value),
        )
      : loaded;
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
                <th>Features/session</th>
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
                  <td>{r.sessions === 0 ? '—' : (featureCount(r) / r.sessions).toFixed(1)}</td>
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
        {by === 'band' ? ` ${BAND_NOTE}` : ''}
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
