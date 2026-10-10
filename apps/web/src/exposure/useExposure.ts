import { useCallback, useEffect, useRef, useState } from 'react';
import { loadLive, recordFix, saveLive, SAMPLE_TRACK } from './live';
import type { LiveLog } from './model';
import {
  ME,
  addPerson,
  loadHousehold,
  personaOf,
  removePerson,
  saveHousehold,
  type Day,
  type Household,
  type Person,
} from './people';
import { loadSpots, saveSpots, type Spot, type SpotKind, type Spots } from './spots';

/** The people being looked at, and who is selected. Kept in this browser. */
export function useHousehold(storage: Storage = window.localStorage): {
  readonly household: Household;
  readonly person: Person;
  readonly select: (id: string) => void;
  readonly add: (details: {
    readonly name: string;
    readonly age: number;
    readonly day: Day;
  }) => string;
  readonly remove: (id: string) => void;
} {
  const [household, setHousehold] = useState<Household>(() => loadHousehold(storage));
  const apply = (next: Household): void => {
    saveHousehold(storage, next);
    setHousehold(next);
  };
  const person =
    household.people.find((p) => p.id === household.current) ?? household.people[0] ?? ME;
  return {
    household,
    person,
    select: (id) => {
      apply({ ...household, current: id });
    },
    add: (details) => {
      const next = addPerson(household, details);
      apply(next);
      return next.current;
    },
    remove: (id) => {
      apply(removePerson(household, id));
    },
  };
}

/** The set places for one person, kept in this browser. Everyone has their own. */
export function useSpots(
  person: Person,
  storage: Storage = window.localStorage,
): {
  readonly spots: Spots;
  readonly set: (kind: SpotKind, spot: Spot) => void;
  readonly clear: (kind: SpotKind) => void;
  readonly replace: (spots: Spots) => void;
} {
  const persona = personaOf(person);
  const [saved, setSaved] = useState<{ readonly id: string; readonly spots: Spots }>(() => ({
    id: person.id,
    spots: loadSpots(storage, person.id, persona),
  }));
  // Switching person loads that person's places; the state is derived, not copied in an effect.
  const spots = saved.id === person.id ? saved.spots : loadSpots(storage, person.id, persona);
  const change = useCallback(
    (next: (current: Spots) => Spots) => {
      const updated = next(spots);
      saveSpots(storage, person.id, updated);
      setSaved({ id: person.id, spots: updated });
    },
    [spots, person.id, storage],
  );
  return {
    spots,
    set: (kind, spot) => {
      change((current) => ({ ...current, [kind]: spot }));
    },
    clear: (kind) => {
      change((current) => Object.fromEntries(Object.entries(current).filter(([k]) => k !== kind)));
    },
    replace: (next) => {
      change(() => next);
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
