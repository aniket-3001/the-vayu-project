// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceSearch } from '../places/ui/PlaceSearch';
import { browserLocate } from '../places/locate';
import { App } from '../App';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('./index', () => ({ track, startAnalytics: () => undefined }));

beforeEach(() => {
  track.mockReset();
  window.localStorage.clear();
});
afterEach(cleanup);

describe('usage events', () => {
  it('counts a search once per lookup, never per keystroke, and never sends what was typed', async () => {
    render(<PlaceSearch search={() => Promise.resolve([])} onPick={() => undefined} />);
    await userEvent.type(screen.getByRole('searchbox'), 'my secret street');
    await screen.findByText(/could not find/u);
    const searches = track.mock.calls.filter((c) => c[0] === 'feature' && c[1] === 'search');
    expect(searches).toHaveLength(1);
    expect(JSON.stringify(track.mock.calls)).not.toContain('secret');
  });

  it('counts a screen visit by its allow-listed name', () => {
    window.location.hash = '#/lens';
    render(<App />);
    expect(track).toHaveBeenCalledWith('screen', 'lens');
    expect(track).toHaveBeenCalledWith('feature', 'air_lens');
  });

  it('counts one visit once, even where React runs effects twice (development)', () => {
    window.location.hash = '#/account';
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(track.mock.calls.filter((c) => c[0] === 'screen' && c[1] === 'account')).toHaveLength(1);
  });

  it('counts a refused location permission', () => {
    const denied = { code: 1, message: 'no' } as GeolocationPositionError;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_ok: unknown, fail: (e: GeolocationPositionError) => void) => { fail(denied); } },
    });
    browserLocate(
      () => undefined,
      () => undefined,
    );
    expect(track).toHaveBeenCalledWith('permission', 'location:denied');
  });
});
