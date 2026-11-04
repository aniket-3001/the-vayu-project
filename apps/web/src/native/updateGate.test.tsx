// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateGate, isOlder, minimumVersion } from './updateGate';

const answering = (body: unknown, ok = true): typeof fetch =>
  vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response));

describe('isOlder', () => {
  it('compares numbers, not text', () => {
    expect(isOlder('0.9.0', '0.10.0')).toBe(true);
    expect(isOlder('0.10.0', '0.9.0')).toBe(false);
    expect(isOlder('1.0', '1.0.1')).toBe(true);
    expect(isOlder('1.2.3', '1.2.3')).toBe(false);
  });
  it('never calls a version older when either is unreadable', () => {
    expect(isOlder('abc', '1.0.0')).toBe(false);
    expect(isOlder('1.0.0', '')).toBe(false);
    expect(isOlder('1.0.0-beta', '2.0.0')).toBe(false);
  });
});

describe('minimumVersion', () => {
  it('reads the minimum from the API', async () => {
    expect(await minimumVersion('https://x', answering({ minAppVersion: '0.2.0' }))).toBe('0.2.0');
  });
  it('treats every kind of trouble as no limit', async () => {
    expect(await minimumVersion('https://x', answering({}, false))).toBeUndefined();
    expect(await minimumVersion('https://x', answering({ minAppVersion: 3 }))).toBeUndefined();
    expect(
      await minimumVersion(
        'https://x',
        vi.fn(() => Promise.reject(new Error('offline'))),
      ),
    ).toBeUndefined();
  });
});

describe('UpdateGate', () => {
  afterEach(cleanup);

  it('shows the update screen on a phone app older than the minimum', async () => {
    render(
      <UpdateGate
        apiUrl="https://x"
        native
        version="0.1.0"
        fetchImpl={answering({ minAppVersion: '0.2.0' })}
      >
        <p>the app</p>
      </UpdateGate>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Update Vayu' })).toBeTruthy();
    });
    expect(screen.queryByText('the app')).toBeNull();
  });

  it('lets a current phone app through', async () => {
    const fetchImpl = answering({ minAppVersion: '0.1.0' });
    render(
      <UpdateGate apiUrl="https://x" native version="0.1.0" fetchImpl={fetchImpl}>
        <p>the app</p>
      </UpdateGate>,
    );
    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalled();
    });
    expect(screen.getByText('the app')).toBeTruthy();
  });

  it('does not ask at all on the website', () => {
    const fetchImpl = answering({ minAppVersion: '9.0.0' });
    render(
      <UpdateGate apiUrl="https://x" native={false} version="0.1.0" fetchImpl={fetchImpl}>
        <p>the app</p>
      </UpdateGate>,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(screen.getByText('the app')).toBeTruthy();
  });

  it('keeps the app when the check fails', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error('offline')));
    render(
      <UpdateGate apiUrl="https://x" native version="0.1.0" fetchImpl={fetchImpl}>
        <p>the app</p>
      </UpdateGate>,
    );
    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalled();
    });
    expect(screen.getByText('the app')).toBeTruthy();
  });
});
