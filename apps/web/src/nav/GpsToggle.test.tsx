// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GPS_STORAGE_KEY, gpsOn, setGps } from '../places/gps';
import { createLiveLocation } from '../places/liveLocation';
import { browserLocate } from '../places/locate';
import { DetectLocation } from './DetectLocation';
import { GpsToggle } from './GpsToggle';

beforeEach(() => {
  window.localStorage.clear();
  setGps(true);
});
afterEach(() => {
  cleanup();
  setGps(true);
});

describe('the GPS switch', () => {
  it('is on to begin with, turns off when pressed, and is remembered', async () => {
    render(<GpsToggle />);
    const button = screen.getByRole('button', { name: 'GPS' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(gpsOn()).toBe(false);
    expect(window.localStorage.getItem(GPS_STORAGE_KEY)).toBe('off');
  });

  it('stops anything asking where the device is while it is off', () => {
    setGps(false);
    const store = createLiveLocation({
      storage: window.localStorage,
      geolocation: () => {
        throw new Error('the device was asked');
      },
    });
    store.set(true);
    expect(store.get()).toMatchObject({ enabled: false, status: 'off' });
    let failed = false;
    browserLocate(
      () => undefined,
      () => {
        failed = true;
      },
    );
    expect(failed).toBe(true);
  });

  it('leaves Detect my location unavailable, and says why, while it is off', () => {
    setGps(false);
    render(<DetectLocation />);
    expect(screen.getByRole('button', { name: /Detect my location/u })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/GPS is off/u);
  });
});
