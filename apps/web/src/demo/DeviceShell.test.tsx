// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PINS_STORAGE_KEY } from '../data/pins';
import { DEVICES_STORAGE_KEY } from '../devices/devices';
import { SPOTS_STORAGE_KEY } from '../exposure/spots';
import { DeviceShell } from './DeviceShell';

// The shell exists only in the prototype build.
beforeEach(() => {
  vi.stubEnv('VITE_DEMO', '1');
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const appFrame = (): HTMLIFrameElement => screen.getByTitle('The Vayu Project app');

describe('the prototype shell', () => {
  it('opens on an iPhone with the app inside a frame, and says the air is made up', () => {
    render(<DeviceShell />);
    expect(screen.getByRole('button', { name: 'iPhone' })).toHaveAttribute('aria-pressed', 'true');
    expect(appFrame()).toHaveAttribute('width', '393');
    expect(appFrame().getAttribute('src')).toContain('embed');
    expect(screen.getByText(/The air is made up/u)).toBeInTheDocument();
  });

  it('switches to each device, resizing the app to that screen and remembering it in the address', async () => {
    render(<DeviceShell />);
    await userEvent.click(screen.getByRole('button', { name: 'Android' }));
    expect(appFrame()).toHaveAttribute('width', '412');
    await userEvent.click(screen.getByRole('button', { name: 'Tablet' }));
    expect(appFrame()).toHaveAttribute('width', '820');
    await userEvent.click(screen.getByRole('button', { name: 'Laptop' }));
    expect(appFrame()).toHaveAttribute('width', '1440');
    expect(window.location.search).toBe('?device=laptop');
    expect(screen.getByRole('button', { name: 'Laptop' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens on the device named in the address, and on the iPhone if the name is wrong', () => {
    window.history.replaceState(null, '', '/?device=android');
    const { unmount } = render(<DeviceShell />);
    expect(appFrame()).toHaveAttribute('width', '412');
    unmount();
    window.history.replaceState(null, '', '/?device=fridge');
    render(<DeviceShell />);
    expect(appFrame()).toHaveAttribute('width', '393');
  });

  it('turns a phone sideways and back, and offers no rotation on a laptop', async () => {
    render(<DeviceShell />);
    await userEvent.click(screen.getByRole('button', { name: /Rotate/u }));
    expect(appFrame()).toHaveAttribute('width', '852');
    await userEvent.click(screen.getByRole('button', { name: /Rotate/u }));
    expect(appFrame()).toHaveAttribute('width', '393');
    await userEvent.click(screen.getByRole('button', { name: 'Laptop' }));
    expect(screen.queryByRole('button', { name: /Rotate/u })).not.toBeInTheDocument();
  });

  it('shows the sample clock on a phone and a browser bar on a laptop', async () => {
    render(<DeviceShell />);
    expect(screen.getByText('5:30 pm')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Laptop' }));
    expect(screen.queryByText('5:30 pm')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload the app' })).toBeInTheDocument();
    expect(screen.getByText(/the-vayu-project/u)).toBeInTheDocument();
  });

  it('starts over: forgets saved places and reloads the app', async () => {
    for (const key of [PINS_STORAGE_KEY, SPOTS_STORAGE_KEY, DEVICES_STORAGE_KEY])
      window.localStorage.setItem(key, '[]');
    render(<DeviceShell />);
    const before = appFrame();
    await userEvent.click(screen.getByRole('button', { name: /Start over/u }));
    for (const key of [PINS_STORAGE_KEY, SPOTS_STORAGE_KEY, DEVICES_STORAGE_KEY])
      expect(window.localStorage.getItem(key)).toBeNull();
    expect(appFrame()).not.toBe(before);
  });

  it('offers a link to open the app on its own', () => {
    render(<DeviceShell />);
    expect(screen.getByRole('link', { name: 'Open on its own' })).toHaveAttribute('href', '?embed');
  });

  it('stages a scenario from its button: the app reopens where the scenario starts', async () => {
    render(<DeviceShell />);
    await userEvent.click(screen.getByRole('button', { name: 'Map and wind' }));
    expect(appFrame().getAttribute('src')).toContain('#/map');
    expect(window.localStorage.getItem('vayu.demo.v1')).toContain('"id":"map"');
    expect(screen.getByRole('button', { name: 'Map and wind' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: /Start over/u }));
    expect(window.localStorage.getItem('vayu.demo.v1')).toBeNull();
    expect(appFrame().getAttribute('src')).toContain('#/');
  });

  it('plays the tour: the first scenario at once, with a caption, and stops when asked', async () => {
    render(<DeviceShell />);
    await userEvent.click(screen.getByRole('button', { name: /Play the \d+-second tour/u }));
    expect(screen.getByRole('status')).toHaveTextContent(/1 of 12/u);
    expect(window.localStorage.getItem('vayu.demo.v1')).toContain('"id":"good"');
    await userEvent.click(screen.getByRole('button', { name: 'Stop the tour' }));
    expect(screen.queryByText(/1 of 12/u)).not.toBeInTheDocument();
  });
});
