// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

  it('shows who comes back with the counts behind each figure, and a dash until a window has passed', async () => {
    mount(stub());
    await userEvent.click(await screen.findByRole('button', { name: 'Journey' }));
    expect(await screen.findByText('38% (5 of 13)')).toBeInTheDocument();
    // Seven days have not passed for anyone yet: no figure, not a zero.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('5 (38%)')).toBeInTheDocument(); // added a place
    expect(screen.getByText('9 (69%)')).toBeInTheDocument(); // searched
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
    expect(funnel.textContent).toContain('Welcome screen shown 40');
    expect(funnel.textContent).toContain('Signed in 5 · 13% of shown');
    expect(funnel.textContent).toContain('Opened the recorded days 12');
    expect(funnel.textContent).toContain('A step failed 2');
  });

  it('puts the AQI bands in order, best air first, and explains what the columns mean', async () => {
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
    const rows = await screen.findAllByRole('row');
    expect(rows[1]?.textContent).toContain('good');
    expect(rows[2]?.textContent).toContain('hazardous');
    expect(rows[2]?.textContent).toContain('3.0'); // 6 features over 2 sessions
    expect(screen.getByText(/Sessions are the sessions that saw that band/u)).toBeInTheDocument();
  });

  it('opens one account and shows its timeline, newest first', async () => {
    const api = stub();
    mount(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Accounts' }));
    await userEvent.click(await screen.findByRole('button', { name: /a@b\.com/u }));
    const items = await screen.findAllByRole('listitem');
    expect(api.user).toHaveBeenCalledWith('u1');
    expect(items[0]?.textContent).toContain('add_place');
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
