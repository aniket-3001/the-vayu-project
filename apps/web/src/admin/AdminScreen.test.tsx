// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AdminScreen } from './AdminScreen';
import { createAdminApi, type AdminApi, type DaySummary, type JourneyCohort } from './adminApi';

afterEach(cleanup);

const day = (n: number): DaySummary => ({
  day: `2026-10-${String(10 + n)}`,
  sessions: n,
  users: n,
  activeSeconds: 120,
  errors: 0,
  features: { 'feature:search': 3 },
});

const cohort = (over: Partial<JourneyCohort> = {}): JourneyCohort => ({
  week: '2026-10-26',
  size: 13,
  signedIn: 4,
  milestones: { first_place: 5, first_search: 9 },
  d1: { eligible: 13, returned: 5 },
  d7: { eligible: 0, returned: 0 },
  d30: { eligible: 0, returned: 0 },
  ...over,
});

const stub = (over: Partial<AdminApi> = {}): AdminApi => ({
  whoami: () => Promise.resolve(),
  summary: () => Promise.resolve([day(1), day(2)]),
  journey: vi.fn(() => Promise.resolve([cohort(), cohort({ week: '2026-10-19', size: 0, d1: { eligible: 0, returned: 0 } })])),
  groups: vi.fn(() =>
    Promise.resolve([{ value: 'android', sessions: 4, users: 2, activeSeconds: 240, errors: 1, features: {} }]),
  ),
  users: () =>
    Promise.resolve([
      {
        userId: 'u1',
        email: 'a@b.com',
        firstSeen: '2026-10-10T00:00:00.000Z',
        lastSeen: '2026-10-12T00:00:00.000Z',
        sessions: 3,
        platform: 'android',
        appVersion: '0.1.0',
        region: 'Delhi',
      },
    ]),
  user: vi.fn((id: string) =>
    Promise.resolve({
      user: {
        userId: id,
        email: 'a@b.com',
        firstSeen: '2026-10-10T00:00:00.000Z',
        lastSeen: '2026-10-12T00:00:00.000Z',
        sessions: 3,
        platform: 'android',
        appVersion: '0.1.0',
        region: 'Delhi',
      },
      events: [
        { at: '2026-10-12T10:01:00.000Z', kind: 'feature', detail: 'add_place', n: 1 },
        { at: '2026-10-12T10:00:00.000Z', kind: 'session_start', detail: '', n: 1 },
      ],
    }),
  ),
  errors: () => Promise.resolve([]),
  ...over,
});

const mount = (api: AdminApi): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminScreen api={api} />} />
        <Route path="/" element={<p>Home screen</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('admin panel', () => {
  it('sends a non-admin home and shows nothing of the panel', async () => {
    mount(stub({ whoami: () => Promise.reject(new Error('403')) }));
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('shows today and the days for an admin', async () => {
    mount(stub());
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('Last 14 days')).toBeInTheDocument();
  });

  it('asks for a group when the picker changes', async () => {
    const api = stub();
    mount(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Groups' }));
    await userEvent.click(await screen.findByRole('button', { name: 'City' }));
    await waitFor(() => {
      expect(api.groups).toHaveBeenCalledWith('region', 14);
    });
  });

  it('shows who comes back with the counts behind each figure, and says when it is too early', async () => {
    mount(stub());
    await userEvent.click(await screen.findByRole('button', { name: 'Journey' }));
    expect(await screen.findByText('38% · 5 of 13')).toBeInTheDocument();
    // Seven and thirty days have not passed for anyone yet: words, not a zero.
    expect(screen.getAllByText('Too early to tell')).toHaveLength(2);
    expect(screen.getByText('5 of 13')).toBeInTheDocument(); // added a place
    expect(screen.getByText('9 of 13')).toBeInTheDocument(); // searched
  });

  it('opens on the newest week that has devices, offers only weeks that have some, and lets you pick another', async () => {
    const api = stub({
      journey: () =>
        Promise.resolve([
          cohort({ week: '2026-11-02', size: 0, signedIn: 0, milestones: {} }), // this week: nobody new yet
          cohort({ week: '2026-10-26', size: 13 }),
          cohort({ week: '2026-10-19', size: 0, signedIn: 0, milestones: {} }), // a quiet week in between
          cohort({ week: '2026-10-12', size: 4, milestones: { first_place: 1 } }),
          cohort({ week: '2026-10-05', size: 0, signedIn: 0, milestones: {} }),
        ]),
    });
    mount(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Journey' }));
    const weeks = within(await screen.findByRole('group', { name: 'Week' }));
    expect(weeks.getAllByRole('button').map((b) => b.textContent)).toEqual(['26 Oct', '12 Oct']);
    expect(weeks.getByRole('button', { name: '26 Oct' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('5 of 13')).toBeInTheDocument();
    await userEvent.click(weeks.getByRole('button', { name: '12 Oct' }));
    expect(await screen.findByText('1 of 4')).toBeInTheDocument();
    // The comparison runs from the newest week with devices to the oldest, keeping the quiet week between them.
    const compared = within(screen.getByRole('region', { name: 'Weeks compared' }));
    expect(compared.getAllByRole('row')).toHaveLength(1 + 3);
  });

  it('says so, instead of showing zeros, when no device has been seen yet', async () => {
    mount(stub({ journey: () => Promise.resolve([cohort({ size: 0, signedIn: 0, milestones: {} })]) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Journey' }));
    expect(await screen.findByText('No new devices seen yet.')).toBeInTheDocument();
    expect(screen.queryByText('0 of 0')).not.toBeInTheDocument();
  });

  it('lays the sign-in funnel out in order, as a share of the welcome screens shown', async () => {
    const funnelDay = (): DaySummary => ({
      ...day(1),
      features: {
        'screen:welcome': 40,
        'feature:welcome_signin_start': 10,
        'feature:welcome_signup_start': 8,
        'feature:welcome_code_step': 6,
        'feature:welcome_signed_in': 5,
        'feature:welcome_guest': 3,
        'feature:recorded_days': 12,
        'feature:welcome_failed': 2,
      },
    });
    mount(stub({ summary: () => Promise.resolve([funnelDay()]) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Journey' }));
    const funnel = await screen.findByRole('region', { name: 'Sign-in funnel' });
    expect(funnel.textContent).toContain('Welcome screen shown40');
    expect(funnel.textContent).toContain('Signed in5 · 13%');
    expect(funnel.textContent).toContain('Opened the recorded days 12');
    expect(funnel.textContent).toContain('A step failed 2');
  });

  it('puts the AQI bands in order, best air first, and says what the figures mean', async () => {
    const api = stub({
      groups: vi.fn(() =>
        Promise.resolve([
          { value: 'hazardous', sessions: 2, users: 0, activeSeconds: 120, errors: 0, features: { 'feature:search': 6 } },
          { value: 'good', sessions: 5, users: 0, activeSeconds: 60, errors: 0, features: { 'feature:search': 5 } },
        ]),
      ),
    });
    mount(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Groups' }));
    await userEvent.click(await screen.findByRole('button', { name: 'AQI band' }));
    await waitFor(() => {
      expect(api.groups).toHaveBeenCalledWith('band', 14);
    });
    const groups = within(await screen.findByRole('region', { name: 'Groups' }));
    const cards = await groups.findAllByRole('listitem');
    const bands = cards.filter((c) => c.className.includes('admin-group'));
    expect(bands[0]?.textContent).toContain('Good');
    expect(bands[1]?.textContent).toContain('Hazardous');
    expect(bands[1]?.textContent).toContain('3.0'); // 6 features over 2 sessions
    expect(screen.getByText(/Sessions that saw each band/u)).toBeInTheDocument();
  });

  it('leaves the sign-in steps out of the features, which are what the app does for people', async () => {
    const api = stub({
      groups: vi.fn(() =>
        Promise.resolve([
          {
            value: 'android',
            sessions: 1,
            users: 1,
            activeSeconds: 60,
            errors: 0,
            features: { 'feature:search': 2, 'feature:welcome_signed_in': 5, 'feature:welcome_code_step': 4 },
          },
        ]),
      ),
    });
    mount(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Groups' }));
    const card = await screen.findByText('session', { selector: 'small' }); // 1 session, not 1 sessions
    const group = card.closest('li');
    expect(group?.textContent).toContain('Search 2');
    expect(group?.textContent).not.toContain('Signed in');
    expect(group?.textContent).toContain('2.0'); // two features in one session, not seven
  });

  it('names a platform and a feature in words, not as stored', async () => {
    mount(stub());
    await userEvent.click(await screen.findByRole('button', { name: 'Groups' }));
    expect(await screen.findByText('Android')).toBeInTheDocument();
  });

  it('opens one account and shows its timeline in words, newest first', async () => {
    const api = stub();
    mount(api);
    await userEvent.click(await screen.findByRole('button', { name: 'People' }));
    await userEvent.click(await screen.findByRole('button', { name: /a@b\.com/u }));
    expect(api.user).toHaveBeenCalledWith('u1');
    const steps = await screen.findAllByText(/^(Added a place|Opened the app)$/u);
    expect(steps.map((e) => e.textContent)).toEqual(['Added a place', 'Opened the app']);
  });

  it('shows opening a screen once, not once as a screen and again as a feature', async () => {
    const api = stub({
      user: vi.fn(() =>
        Promise.resolve({
          user: {
            userId: 'u1',
            email: 'a@b.com',
            firstSeen: '2026-10-10T00:00:00.000Z',
            lastSeen: '2026-10-12T00:00:00.000Z',
            sessions: 1,
            platform: 'android',
            appVersion: '0.1.0',
            region: 'Delhi',
          },
          events: [
            { at: '2026-10-12T10:02:00.000Z', kind: 'feature', detail: 'air_lens', n: 1 },
            { at: '2026-10-12T10:02:00.000Z', kind: 'screen', detail: 'lens', n: 1 },
          ],
        }),
      ),
    });
    mount(api);
    await userEvent.click(await screen.findByRole('button', { name: 'People' }));
    await userEvent.click(await screen.findByRole('button', { name: /a@b\.com/u }));
    expect(await screen.findAllByText('Opened AIR Lens')).toHaveLength(1);
  });

  it('is not linked from anywhere in the normal app', () => {
    window.location.hash = '#/';
    render(<App />);
    expect(document.querySelector('a[href*="admin"]')).toBeNull();
  });
});

describe('admin api', () => {
  it('sends the token and treats any refusal as a failure', async () => {
    const calls: { url: string; auth: string | undefined }[] = [];
    const fetchImpl = ((url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, auth: init.headers.authorization });
      return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;
    const api = createAdminApi('https://x.test/', () => Promise.resolve('tok'), fetchImpl);
    await expect(api.whoami()).rejects.toThrow();
    expect(calls[0]).toEqual({ url: 'https://x.test/v1/admin/whoami', auth: 'Bearer tok' });
  });
});
