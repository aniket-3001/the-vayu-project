import { useCallback, useEffect, useRef, useState } from 'react';
import { loadLive, recordFix, saveLive, SAMPLE_TRACK } from './live';
import type { LiveLog } from './model';
import { loadPersona, savePersona, type Persona } from './persona';
import { loadSpots, saveSpots, type Spot, type SpotKind, type Spots } from './spots';

/** Which kind of person this is for, kept in this browser. */
export function usePersona(
  storage: Storage = window.localStorage,
): readonly [Persona, (next: Persona) => void] {
  const [persona, setPersona] = useState<Persona>(() => loadPersona(storage));
  return [
    persona,
    (next) => {
      savePersona(storage, next);
      setPersona(next);
    },
  ];
}

/** The set places for one kind of person, kept in this browser. Each kind of person has their own. */
export function useSpots(
  persona: Persona,
  storage: Storage = window.localStorage,
): {
  readonly spots: Spots;
  readonly set: (kind: SpotKind, spot: Spot) => void;
  readonly clear: (kind: SpotKind) => void;
} {
  const [saved, setSaved] = useState<{ readonly persona: Persona; readonly spots: Spots }>(() => ({
    persona,
    spots: loadSpots(storage, persona),
  }));
  // Switching person loads that person's places; the state is derived, not copied in an effect.
  const spots = saved.persona === persona ? saved.spots : loadSpots(storage, persona);
  const change = useCallback(
    (next: (current: Spots) => Spots) => {
      const updated = next(spots);
      saveSpots(storage, persona, updated);
      setSaved({ persona, spots: updated });
    },
    [spots, persona, storage],
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
