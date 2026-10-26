// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pin } from '../data/pins';
import type * as Store from './store';

const { noteAir } = vi.hoisted(() => ({ noteAir: vi.fn() }));
vi.mock('../analytics/index', () => ({ noteAir, track: () => undefined, startAnalytics: () => undefined }));

const pin: Pin = { id: '28.59,77.05', name: 'Home', detail: 'Delhi', lat: 28.59, lng: 77.05 };

// The test set-up has already loaded the air store with the real analytics, so load a fresh copy that sees the mock.
const freshStore = async (): Promise<typeof Store> => {
  vi.resetModules();
  const store = await import('./store');
  const { sampleAirSource } = await import('../testing/sampleAirSource');
  store.setAirStoreFactory(() => new store.AirStore(sampleAirSource()));
  return store;
};

beforeEach(() => {
  noteAir.mockReset();
});

describe('telling analytics what the air is like where the person is looking', () => {
  it('reports the reading of the place on show, once it has loaded', async () => {
    const { useToday } = await freshStore();
    renderHook(() => useToday(pin));
    await waitFor(() => {
      expect(noteAir).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  it('reports the first place on the home screen', async () => {
    const { useTodays } = await freshStore();
    renderHook(() => useTodays([pin]));
    await waitFor(() => {
      expect(noteAir).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  it('reports nothing while no place is shown', async () => {
    const { useToday } = await freshStore();
    renderHook(() => useToday(undefined));
    expect(noteAir.mock.calls.every((c) => c[0] === undefined)).toBe(true);
  });
});
