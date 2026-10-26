// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AdminScreen } from './AdminScreen';
import { createAdminApi, type AdminApi, type DaySummary } from './adminApi';

afterEach(cleanup);

const day = (n: number): DaySummary => ({
  day: `2026-10-${String(10 + n)}`,
  sessions: n,
  users: n,
  activeSeconds: 120,
  errors: 0,
  features: { 'feature:search': 3 },
});

const stub = (over: Partial<AdminApi> = {}): AdminApi => ({
  whoami: () => Promise.resolve(),
  summary: () => Promise.resolve([day(1), day(2)]),
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
