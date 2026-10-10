// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PINS_STORAGE_KEY } from '../data/pins';
import { DeviceShell } from './DeviceShell';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
});
afterEach(cleanup);

const appFrame = (): HTMLIFrameElement => screen.getByTitle('Vayu Air app');

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
    expect(screen.getByText('8:30')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Laptop' }));
    expect(screen.queryByText('8:30')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload the app' })).toBeInTheDocument();
    expect(screen.getByText(/vayuair\.in/u)).toBeInTheDocument();
  });

  it('starts over: forgets saved places and reloads the app', async () => {
    window.localStorage.setItem(PINS_STORAGE_KEY, '[]');
    render(<DeviceShell />);
    const before = appFrame();
    await userEvent.click(screen.getByRole('button', { name: /Start over/u }));
    expect(window.localStorage.getItem(PINS_STORAGE_KEY)).toBeNull();
    expect(appFrame()).not.toBe(before);
  });

  it('offers a link to open the app on its own', () => {
    render(<DeviceShell />);
    expect(screen.getByRole('link', { name: 'Open on its own' })).toHaveAttribute('href', '?embed');
  });
});
