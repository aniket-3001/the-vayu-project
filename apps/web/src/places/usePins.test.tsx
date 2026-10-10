// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePins } from './usePins';

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('vayu.pins.v1', '[]');
});

describe('the pinned places, shared', () => {
  it('shows a place added through one copy in every other copy at once', () => {
    const adder = renderHook(() => usePins());
    const watcher = renderHook(() => usePins());
    expect(watcher.result.current.pins).toHaveLength(0);
    act(() => {
      adder.result.current.add({ name: 'Home', lat: 28.59, lng: 77.22 });
    });
    expect(watcher.result.current.pins.map((p) => p.name)).toEqual(['Home']);
    expect(adder.result.current.pins.map((p) => p.name)).toEqual(['Home']);
  });

  it('keeps both changes when two copies change places one after the other', () => {
    const a = renderHook(() => usePins());
    const b = renderHook(() => usePins());
    act(() => {
      a.result.current.add({ name: 'Home', lat: 28.59, lng: 77.22 });
    });
    act(() => {
      // This copy has already heard of Home, but even a stale one must not overwrite it.
      b.result.current.add({ name: 'School', lat: 28.4, lng: 77.05 });
    });
    expect(a.result.current.pins.map((p) => p.name).sort()).toEqual(['Home', 'School']);
  });

  it('removes a place everywhere', () => {
    const a = renderHook(() => usePins());
    const b = renderHook(() => usePins());
    act(() => {
      a.result.current.add({ name: 'Home', lat: 28.59, lng: 77.22 });
    });
    const id = a.result.current.pins[0]?.id ?? '';
    act(() => {
      b.result.current.remove(id);
    });
    expect(a.result.current.pins).toHaveLength(0);
  });
});
