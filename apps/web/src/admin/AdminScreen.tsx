import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccount } from '../account/AccountContext';
import { API_URL } from '../config';
import { LEVELS } from '../design/levels';
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
  ['overview', 'Today'],
  ['journey', 'Journey'],
  ['groups', 'Groups'],
  ['accounts', 'People'],
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
const RANGES = [7, 14, 30] as const;

/** The AQI bands in order, so their rows read from best air to worst, whatever their counts. */
const BAND_ORDER = ['good', 'moderate', 'sensitive', 'unhealthy', 'very_bad', 'hazardous'];

/** Values as the app stores them, in words a person would use. Anything not listed (a city, a version) is shown as it is. */
const NAMES: Readonly<Record<string, string>> = {
  android: 'Android',
  ios: 'iOS',
  web: 'Web',
  signed_in: 'Signed in',
  anonymous: 'Anonymous',
  new: 'New',
  returning: 'Returning',
  good: 'Good',
  moderate: 'Moderate',
  sensitive: 'Sensitive',
  unhealthy: 'Unhealthy',
  very_bad: 'Very bad',
  hazardous: 'Hazardous',
  unknown: 'Unknown',
};
const nice = (value: string): string => NAMES[value] ?? value;

/** The milestones, in the order they are shown, with names a person would use. */
const MILESTONE_LABELS: readonly (readonly [string, string])[] = [
  ['first_place', 'Added a place'],
  ['first_search', 'Searched'],
  ['first_detect', 'Detected location'],
  ['first_lens', 'Tried AIR Lens'],
  ['first_exposure', 'Opened Exposure'],
  ['first_map', 'Opened the map'],
  ['first_assistant', 'Asked the assistant'],
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

/** What each feature is called on the page. The welcome steps use the funnel's own words. */
const FEATURE_NAMES: Readonly<Record<string, string>> = {
  detect_location: 'Detect location',
  add_place: 'Add a place',
  search: 'Search',
  air_lens: 'AIR Lens',
  assistant: 'Assistant',
  exposure: 'Exposure',
  map_layer: 'Map layer',
  recorded_days: 'Recorded days',
  bluetooth_connect: 'Bluetooth connect',
  welcome_signin_start: 'Opened sign in',
  welcome_signup_start: 'Opened create account',
  welcome_code_step: 'Reached email code',
  welcome_confirmed: 'Confirmed email',
  welcome_signed_in: 'Signed in',
  welcome_guest: 'Continued as guest',
  welcome_failed: 'Sign-in step failed',
};
const featureLabel = (name: string): string => {
  const key = name.slice(name.indexOf(':') + 1);
  const plain = FEATURE_NAMES[key] ?? key.replace(/_/gu, ' ');
  return plain.charAt(0).toUpperCase() + plain.slice(1);
};
/** What the app does for people. The steps of signing in are counted on the Journey tab, not as features. */
const isProductFeature = (name: string): boolean =>
  name.startsWith('feature:') && !name.startsWith('feature:welcome_');
const featureCount = (stats: DayStats): number =>
  Object.entries(stats.features)
    .filter(([name]) => isProductFeature(name))
    .reduce((sum, [, n]) => sum + n, 0);
const topFeatures = (stats: DayStats, count: number): readonly (readonly [string, number])[] =>
  Object.entries(stats.features)
    .filter(([name]) => isProductFeature(name))
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([name, n]) => [featureLabel(name), n] as const);
const minutes = (seconds: number): string => (seconds / 60).toFixed(1);
const percent = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "26 Oct" from a day key such as 2026-10-26. */
const dayText = (key: string): string =>
  `${String(Number(key.slice(8, 10)))} ${MONTHS[Number(key.slice(5, 7)) - 1] ?? ''}`;
/** "26 Oct, 14:59" in India time, from a timestamp. */
const whenText = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

/** Just for the two owners. Anyone else is sent back to the home screen, and the server refuses them anyway. */
export function AdminScreen({ api }: { readonly api?: AdminApi }): React.JSX.Element | null {
  const account = useAccount();
  const navigate = useNavigate();
  const real = useMemo(
    () =>
      api !== undefined || account.idToken === undefined
        ? api
        : createAdminApi(API_URL, account.idToken),
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
        <div className="admin-tabs" role="group" aria-label="Admin sections">
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
    <p className="admin-hint">Loading…</p>
  ) : value === 'failed' ? (
    <p className="admin-hint">Could not load this just now.</p>
  ) : null;

/** One short line under a figure that needs it. */
const Hint = ({ children }: { readonly children: React.ReactNode }): React.JSX.Element => (
  <p className="admin-hint">{children}</p>
);

/** A row of small pills: a feature and how many times it was used. */
function Chips({
  items,
}: {
  readonly items: readonly (readonly [string, number])[];
}): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <ul className="admin-chips">
      {items.map(([label, n]) => (
        <li key={label}>
          {label} <b>{n}</b>
        </li>
      ))}
    </ul>
  );
}

/** A labelled bar: how much of a whole, with the words that say it. */
function Meter({
  label,
  fraction,
  value,
  muted = false,
}: {
  readonly label: string;
  readonly fraction: number;
  readonly value: string;
  readonly muted?: boolean;
}): React.JSX.Element {
  return (
    <div className="admin-rate">
      <div className="admin-rate-head">
        <span>{label}</span>
        <span className={muted ? 'admin-hint' : 'admin-rate-value'}>{value}</span>
      </div>
      <div className="admin-meter" aria-hidden="true">
        <span style={{ width: `${String(Math.min(100, Math.max(0, fraction * 100)))}%` }} />
      </div>
    </div>
  );
}

/** Sessions per day as columns, oldest first, with the number above each and the day below. */
function DayChart({ days }: { readonly days: readonly DaySummary[] }): React.JSX.Element {
  const most = Math.max(1, ...days.map((d) => d.sessions));
  const busiest = days.reduce(
    (a, b) => (b.sessions > a.sessions ? b : a),
    days[0] ?? { day: '', sessions: 0, users: 0 },
  );
  const label = `Sessions per day: ${days.map((d) => `${dayText(d.day)} ${String(d.sessions)}`).join(', ')}`;
  return (
    <>
      <div
        className="admin-chart"
        role="img"
        aria-label={label}
        style={{ gridTemplateColumns: `repeat(${String(days.length)}, minmax(0, 1fr))` }}
      >
        {days.map((d, i) => {
          const last = i === days.length - 1;
          const month =
            i === 0 || d.day.endsWith('-01') ? (MONTHS[Number(d.day.slice(5, 7)) - 1] ?? '') : '';
          return (
            <div key={d.day} className="admin-col" aria-hidden="true">
              <span className="admin-col-n">{d.sessions > 0 ? d.sessions : ''}</span>
              <span className="admin-col-track">
                <span
                  className={`admin-col-bar${d.sessions === 0 ? ' zero' : ''}${last ? ' today' : ''}`}
                  style={{
                    height:
                      d.sessions === 0
                        ? undefined
                        : `${String(Math.max(4, (d.sessions / most) * 100))}%`,
                  }}
                />
              </span>
              <span className="admin-col-d">{Number(d.day.slice(8, 10))}</span>
              <span className="admin-col-m">{month}</span>
            </div>
          );
        })}
      </div>
      {busiest.sessions > 0 && (
        <p className="admin-hint">
          Busiest day {dayText(busiest.day)}: {busiest.sessions} sessions, {busiest.users} people.
        </p>
      )}
    </>
  );
}

function Overview({ api }: { readonly api: AdminApi }): React.JSX.Element {
  const days = useLoaded(() => api.summary(14), [api]);
  if (days === undefined || days === 'failed') return <Status value={days} />;
  const today: DaySummary | undefined = days[days.length - 1];
  const tiles: readonly (readonly [string, string, string])[] = [
    ['People', String(today?.users ?? 0), 'Devices seen today'],
    ['Sessions', String(today?.sessions ?? 0), 'Times the app was opened'],
    ['Minutes in app', minutes(today?.activeSeconds ?? 0), 'Time on screen'],
    ['Errors', String(today?.errors ?? 0), 'Unhandled app errors'],
  ];
  return (
    <>
      <section className="card" aria-label="Today">
        <h2>Today</h2>
        <dl className="admin-tiles">
          {tiles.map(([name, value, hint]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
              <dd className="admin-hint">{hint}</dd>
            </div>
          ))}
        </dl>
        {today !== undefined && topFeatures(today, 6).length > 0 && (
          <>
            <h3>Used today</h3>
            <Chips items={topFeatures(today, 6)} />
          </>
        )}
      </section>
      <section className="card" aria-label="Last 14 days">
        <h2>Last 14 days</h2>
        <DayChart days={days} />
      </section>
    </>
  );
}

/** "38%  ·  5 of 13", or the reason there is nothing to show yet. */
const rateParts = (rate: Rate): { fraction: number; text: string; muted: boolean } =>
  rate.eligible === 0
    ? { fraction: 0, text: 'Too early to tell', muted: true }
    : {
        fraction: rate.returned / rate.eligible,
        text: `${String(percent(rate.returned, rate.eligible))}% · ${String(rate.returned)} of ${String(rate.eligible)}`,
        muted: false,
      };

/** From the newest week that has new devices to the oldest that has, with any empty weeks between kept in place. */
function weeksWithDevices(cohorts: readonly JourneyCohort[]): readonly JourneyCohort[] {
  const at = cohorts.flatMap((c, i) => (c.size > 0 ? [i] : []));
  const first = at[0];
  const last = at[at.length - 1];
  return first === undefined || last === undefined ? [] : cohorts.slice(first, last + 1);
}

/** Adds the figures of every day into one count per name. */
function totals(days: readonly DaySummary[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const day of days)
    for (const [name, n] of Object.entries(day.features)) out[name] = (out[name] ?? 0) + n;
  return out;
}

/** What happens to new people: who comes back, what they do first, and where visitors leave the sign-in screen. */
function Journey({ api }: { readonly api: AdminApi }): React.JSX.Element {
  const loaded = useLoaded<readonly JourneyCohort[]>(() => api.journey(8), [api]);
  const days = useLoaded<readonly DaySummary[]>(() => api.summary(30), [api]);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  // A week with no new devices has nothing to open, so only weeks that have some are offered, newest first.
  const cohorts = Array.isArray(loaded)
    ? weeksWithDevices(loaded as readonly JourneyCohort[])
    : undefined;
  const offered = cohorts?.filter((c) => c.size > 0);
  const week = offered?.find((c) => c.week === picked) ?? offered?.[0];
  const done = Array.isArray(days) ? totals(days as readonly DaySummary[]) : undefined;
  const shown = done?.['screen:welcome'] ?? 0;

  return (
    <>
      <section className="card" aria-label="New devices">
        <h2>New devices</h2>
        <Status value={loaded} />
        {cohorts !== undefined && week === undefined && (
          <p className="admin-hint">No new devices seen yet.</p>
        )}
        {offered !== undefined && week !== undefined && (
          <>
            <div className="admin-picks" role="group" aria-label="Week">
              {offered.map((c) => (
                <button
                  key={c.week}
                  type="button"
                  aria-pressed={week.week === c.week}
                  onClick={() => {
                    setPicked(c.week);
                  }}
                >
                  {dayText(c.week)}
                </button>
              ))}
            </div>
            <dl className="admin-tiles">
              <div>
                <dt>New devices</dt>
                <dd>{week.size}</dd>
                <dd className="admin-hint">Week of {dayText(week.week)}</dd>
              </div>
              <div>
                <dt>Signed in</dt>
                <dd>{week.signedIn}</dd>
                <dd className="admin-hint">Of those {week.size}</dd>
              </div>
            </dl>
            <Hint>A device is one phone or browser, counted the first time it is seen.</Hint>
          </>
        )}
      </section>

      {week !== undefined && (
        <>
          <section className="card" aria-label="Who comes back">
            <h2>Who comes back</h2>
            {(
              [
                ['The next day', week.d1],
                ['Within 7 days', week.d7],
                ['Within 30 days', week.d30],
              ] as const
            ).map(([label, rate]) => {
              const parts = rateParts(rate);
              return (
                <Meter
                  key={label}
                  label={label}
                  fraction={parts.fraction}
                  value={parts.text}
                  muted={parts.muted}
                />
              );
            })}
            <Hint>Counted only once the whole window has passed.</Hint>
          </section>

          <section className="card" aria-label="What new people do first">
            <h2>What they do</h2>
            {MILESTONE_LABELS.map(([id, label]) => {
              const n = week.milestones[id] ?? 0;
              return (
                <Meter
                  key={id}
                  label={label}
                  fraction={week.size === 0 ? 0 : n / week.size}
                  value={`${String(n)} of ${String(week.size)}`}
                />
              );
            })}
            <Hint>How many of these devices have ever done it.</Hint>
          </section>
        </>
      )}

      {cohorts !== undefined && cohorts.length > 1 && (
        <section className="card" aria-label="Weeks compared">
          <h2>Weeks compared</h2>
          <table className="admin-mini">
            <thead>
              <tr>
                <th>Week</th>
                <th>New</th>
                <th>Next day</th>
                <th>7 days</th>
                <th>30 days</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.week}>
                  <td>{dayText(c.week)}</td>
                  <td>{c.size}</td>
                  {[c.d1, c.d7, c.d30].map((rate, i) => (
                    <td key={i}>
                      {rate.eligible === 0
                        ? '–'
                        : `${String(percent(rate.returned, rate.eligible))}%`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card" aria-label="Sign-in funnel">
        <h2>Sign-in funnel</h2>
        <Status value={days} />
        {done !== undefined && (
          <>
            {FUNNEL.map(([id, label]) => (
              <Meter
                key={id}
                label={label}
                fraction={shown === 0 ? 0 : (done[id] ?? 0) / shown}
                value={
                  id === 'screen:welcome'
                    ? String(done[id] ?? 0)
                    : `${String(done[id] ?? 0)} · ${String(percent(done[id] ?? 0, shown))}%`
                }
              />
            ))}
            <Hint>The last 30 days. Counts taps, so one person can appear twice.</Hint>
            <h3>Other ways in</h3>
            <Chips items={AROUND.map(([id, label]) => [label, done[id] ?? 0] as const)} />
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
      <div className="admin-picks" role="group" aria-label="Group by">
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
      <div className="admin-picks" role="group" aria-label="Days">
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
      {by === 'band' && (
        <Hint>Sessions that saw each band. The rest is what happened while it showed.</Hint>
      )}
      <Status value={rows} />
      {Array.isArray(rows) && rows.length === 0 && (
        <p className="admin-hint">Nothing recorded in these days yet.</p>
      )}
      {Array.isArray(rows) && (
        <ul className="admin-groups">
          {(rows as readonly GroupRow[]).map((r) => {
            const level = by === 'band' ? LEVELS[BAND_ORDER.indexOf(r.value)] : undefined;
            return (
              <li key={r.value} className="admin-group">
                <div className="admin-group-head">
                  <strong>
                    {level !== undefined && (
                      <i
                        className="admin-dot"
                        style={{ background: level.solid }}
                        aria-hidden="true"
                      />
                    )}
                    {nice(r.value)}
                  </strong>
                  <span className="admin-group-big">
                    {r.sessions}
                    <small> {r.sessions === 1 ? 'session' : 'sessions'}</small>
                  </span>
                </div>
                <dl className="admin-facts">
                  <div>
                    <dt>People-days</dt>
                    <dd>{r.users}</dd>
                  </div>
                  <div>
                    <dt>Minutes / session</dt>
                    <dd>{r.sessions === 0 ? '–' : minutes(r.activeSeconds / r.sessions)}</dd>
                  </div>
                  <div>
                    <dt>Features / session</dt>
                    <dd>{r.sessions === 0 ? '–' : (featureCount(r) / r.sessions).toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>Errors</dt>
                    <dd>{r.errors}</dd>
                  </div>
                </dl>
                <Chips items={topFeatures(r, 4)} />
              </li>
            );
          })}
        </ul>
      )}
      <Hint>People-days: each person counted once for every day they were active.</Hint>
    </section>
  );
}

function Accounts({ api }: { readonly api: AdminApi }): React.JSX.Element {
  const [open, setOpen] = useState<string | undefined>(undefined);
  const users = useLoaded<readonly AccountRow[]>(() => api.users(), [api]);
  if (open !== undefined)
    return (
      <AccountDetail
        api={api}
        id={open}
        back={() => {
          setOpen(undefined);
        }}
      />
    );
  return (
    <section className="card" aria-label="Accounts">
      <h2>Signed-in accounts</h2>
      <Status value={users} />
      {Array.isArray(users) && users.length === 0 && (
        <p className="admin-hint">No signed-in accounts yet.</p>
      )}
      {Array.isArray(users) && (
        <ul className="admin-rows">
          {(users as readonly AccountRow[]).map((u) => (
            <li key={u.userId}>
              <button
                type="button"
                className="admin-row"
                onClick={() => {
                  setOpen(u.userId);
                }}
              >
                <span className="admin-avatar" aria-hidden="true">
                  {u.email.charAt(0).toUpperCase()}
                </span>
                <span className="admin-row-text">
                  <strong>{u.email}</strong>
                  <span className="admin-hint">
                    {nice(u.platform)} · {u.region} · {u.sessions}{' '}
                    {u.sessions === 1 ? 'session' : 'sessions'} · seen {whenText(u.lastSeen)}
                  </span>
                </span>
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const SCREEN_NAMES: Readonly<Record<string, string>> = {
  myair: 'My Air',
  place: 'a place',
  account: 'Account',
  exposure: 'Exposure',
  map: 'the map',
  lens: 'AIR Lens',
  room: 'Your room',
  week: 'the recorded days',
  admin: 'the admin panel',
  welcome: 'the welcome screen',
};
/** What a person did, as a short past-tense phrase. */
const DID: Readonly<Record<string, string>> = {
  detect_location: 'Detected their location',
  add_place: 'Added a place',
  search: 'Searched for a place',
  air_lens: 'Opened AIR Lens',
  assistant: 'Asked the assistant',
  exposure: 'Opened Exposure',
  map_layer: 'Changed a map layer',
  recorded_days: 'Opened the recorded days',
  bluetooth_connect: 'Tried to connect a unit',
  welcome_signin_start: 'Opened sign in',
  welcome_signup_start: 'Opened create account',
  welcome_code_step: 'Reached the email code',
  welcome_confirmed: 'Confirmed their email',
  welcome_signed_in: 'Signed in',
  welcome_guest: 'Continued as a guest',
  welcome_failed: 'A sign-in step failed',
};
const OTHER: Readonly<Record<string, string>> = {
  'location:granted': 'Allowed location',
  'location:denied': 'Refused location',
  'connect:ok': 'Connected a unit',
  'connect:fail': 'A unit would not connect',
};

/** Opening these two screens is also counted as using them. The screen's own line already says it, so the second is skipped. */
const isShownByScreen = (kind: string, detail: string): boolean =>
  kind === 'feature' && (detail === 'air_lens' || detail === 'exposure');

/** One line for a timeline entry, in words. */
function eventText(kind: string, detail: string): string {
  if (kind === 'session_start') return 'Opened the app';
  if (kind === 'screen') return `Opened ${SCREEN_NAMES[detail] ?? detail}`;
  if (kind === 'feature') return DID[detail] ?? detail.replace(/_/gu, ' ');
  if (kind === 'context') return `Air was ${nice(detail).toLowerCase()}`;
  if (kind === 'error') return `Error: ${detail}`;
  return OTHER[detail] ?? (detail === '' ? kind : `${kind}: ${detail}`);
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
          <div className="admin-who">
            <span className="admin-avatar" aria-hidden="true">
              {found.user.email.charAt(0).toUpperCase()}
            </span>
            <h2>{found.user.email}</h2>
          </div>
          <ul className="admin-chips">
            <li>{`${nice(found.user.platform)} ${found.user.appVersion}`}</li>
            <li>{found.user.region}</li>
          </ul>
          <p className="admin-hint">
            First seen {dayText(found.user.firstSeen.slice(0, 10))} · first place{' '}
            {found.user.firstPlaceAt === undefined
              ? 'not added yet'
              : `added ${dayText(found.user.firstPlaceAt.slice(0, 10))}`}
          </p>
          <h3>Activity, newest first</h3>
          <ol className="admin-timeline">
            {found.events
              .filter((e) => !isShownByScreen(e.kind, e.detail))
              .map((e, i) => (
                <li key={`${e.at}-${String(i)}`}>
                  <span className="admin-hint">{whenText(e.at)}</span>
                  <span>{eventText(e.kind, e.detail)}</span>
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
      {Array.isArray(errors) && errors.length === 0 && (
        <p className="admin-hint">No errors recorded. Good.</p>
      )}
      {Array.isArray(errors) && (
        <ul className="admin-rows">
          {(errors as readonly ErrorRow[]).map((e, i) => (
            <li key={`${e.at}-${String(i)}`} className="admin-error">
              <strong>{e.detail}</strong>
              <span className="admin-hint">
                {nice(e.platform)} {e.appVersion} · {e.region} · {whenText(e.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
