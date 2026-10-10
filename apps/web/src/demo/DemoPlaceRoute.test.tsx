// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

// The day switcher exists only in the prototype build.
beforeEach(() => {
  vi.stubEnv('VITE_DEMO', '1');
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('the prototype’s day switcher', () => {
  const openHome = (search = ''): void => {
    window.location.hash = `#/place/${encodeURIComponent('28.59,77.05')}${search}`;
  };

  it('opens a place on its own made-up day, and changes the whole screen when another is picked', async () => {
    window.localStorage.clear();
    openHome();
    render(<App />);
    expect(screen.getByRole('region', { name: 'Unhealthy' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Winter smog/u }));
    expect(screen.getByRole('region', { name: 'Hazardous' })).toBeInTheDocument();
    expect(window.location.hash).toContain('day=hazardous');
    expect(screen.getByRole('button', { name: /Winter smog/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('opens on the day named in the address, and falls back when the name is nonsense', () => {
    window.localStorage.clear();
    openHome('?day=good');
    const { unmount } = render(<App />);
    expect(screen.getByRole('region', { name: 'Good' })).toBeInTheDocument();
    unmount();
    openHome('?day=nope');
    render(<App />);
    expect(screen.getByRole('region', { name: 'Unhealthy' })).toBeInTheDocument();
  });
});
