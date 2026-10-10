import { useCallback, useEffect, useRef, useState } from 'react';
import { loadLive, recordFix, saveLive, SAMPLE_TRACK } from './live';
import type { LiveLog } from './model';
import { loadSpots, saveSpots, type Spot, type SpotKind, type Spots } from './spots';

/** The person's set places, kept in this browser. */
export function useSpots(storage: Storage = window.localStorage): {
  readonly spots: Spots;
  readonly set: (kind: SpotKind, spot: Spot) => void;
  readonly clear: (kind: SpotKind) => void;
} {
  const [spots, setSpots] = useState<Spots>(() => loadSpots(storage));
  const change = useCallback(
    (next: (current: Spots) => Spots) => {
      setSpots((current) => {
        const updated = next(current);
        saveSpots(storage, updated);
        return updated;
      });
    },
    [storage],
  );
  return {
    spots,
    set: (kind, spot) => {
      change((current) => ({ ...current, [kind]: spot }));
    },
    clear: (kind) => {
      change((current) => Object.fromEntries(Object.entries(current).filter(([k]) => k !== kind)));
    },
  };
}

export type LiveState = 'off' | 'asking' | 'on' | 'refused' | 'unavailable';

/**
 * Live location: asks the browser, then logs where the person is for as long as the app is open. A
 * browser page cannot track in the background, so the screen says so.
 */
export function useLive(storage: Storage = window.localStorage): {
  readonly log: LiveLog;
  readonly state: LiveState;
  readonly sample: boolean;
  readonly start: () => void;
  readonly stop: () => void;
  readonly showSample: () => void;
  readonly clearLog: () => void;
} {
  const [log, setLog] = useState<LiveLog>(() => loadLive(storage));
  const [state, setState] = useState<LiveState>('off');
  const [sample, setSample] = useState(false);
  const watch = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setState('off');
  }, []);

  useEffect(() => stop, [stop]);

  const start = (): void => {
    if (!('geolocation' in navigator)) {
      setState('unavailable');
      return;
    }
    setState('asking');
    watch.current = navigator.geolocation.watchPosition(
      (position) => {
        setState('on');
        setSample(false);
        setLog((current) => {
          const next = recordFix(current, position.coords.latitude, position.coords.longitude);
          saveLive(storage, next);
          return next;
        });
      },
      () => {
        setState('refused');
      },
      { maximumAge: 60_000, timeout: 20_000 },
    );
  };

  return {
    log: sample ? SAMPLE_TRACK : log,
    state,
    sample,
    start,
    stop,
    showSample: () => {
      setSample(true);
    },
    clearLog: () => {
      setSample(false);
      setLog({});
      saveLive(storage, {});
    },
  };
}
