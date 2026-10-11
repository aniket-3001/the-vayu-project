import { useCallback, useEffect, useState } from 'react';
import { useLiveLocation } from '../places/liveLocation';
import { airStore } from '../air/store';
import { loadLive, recordFix, saveLive } from './live';
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
import {
  OUTINGS_CHANGED,
  addOuting,
  loadOutings,
  newOuting,
  removeOuting,
  saveOutings,
  type Outing,
} from './outings';
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
 * Live location for Exposure: the same switch as the one on every screen, plus the log of where the device was each
 * hour while the app was open. A browser page cannot track in the background, so the screen says so.
 */
export function useLive(storage: Storage = window.localStorage): {
  readonly log: LiveLog;
  readonly state: LiveState;
  readonly sample: boolean;
  readonly start: () => void;
  readonly stop: () => void;
  /** Shows a made-up day of movement. Only the test source has one; the deployed app has none. */
  readonly showSample: (() => void) | undefined;
  readonly clearLog: () => void;
} {
  const [log, setLog] = useState<LiveLog>(() => loadLive(storage));
  const track = airStore().madeUpExposure()?.track;
  const [sample, setSample] = useState(false);
  const here = useLiveLocation();

  // Each fix, while live location is on, is written down against the hour it came in.
  const lat = here.position?.lat;
  const lng = here.position?.lng;
  // Each look counts, moved or not: standing still all afternoon is still an afternoon in that place.
  const looked = here.checkedAt;
  useEffect(() => {
    if (!here.enabled || here.status !== 'on' || lat === undefined || lng === undefined) return;
    setSample(false);
    setLog((current) => {
      const next = recordFix(current, lat, lng);
      saveLive(storage, next);
      return next;
    });
  }, [here.enabled, here.status, lat, lng, looked, storage]);

  return {
    log: sample && track !== undefined ? track : log,
    state: here.status,
    sample,
    start: () => {
      here.set(true);
    },
    stop: () => {
      here.set(false);
    },
    showSample:
      track === undefined
        ? undefined
        : () => {
            setSample(true);
          },
    clearLog: () => {
      setSample(false);
      setLog({});
      saveLive(storage, {});
    },
  };
}

/** What someone has logged doing outdoors. Shared by every screen, so the assistant can add one while Exposure is open. */
export function useOutings(
  person: Person,
  storage: Storage = window.localStorage,
): {
  readonly outings: readonly Outing[];
  readonly add: (details: Omit<Outing, 'id'>) => void;
  readonly remove: (id: string) => void;
} {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const again = (): void => {
      setVersion((n) => n + 1);
    };
    window.addEventListener(OUTINGS_CHANGED, again);
    return () => {
      window.removeEventListener(OUTINGS_CHANGED, again);
    };
  }, []);
  // `version` is read so a change elsewhere reloads the list.
  const outings = version >= 0 ? loadOutings(storage, person.id) : [];
  return {
    outings,
    add: (details) => {
      saveOutings(storage, person.id, addOuting(outings, newOuting(details, outings)));
    },
    remove: (id) => {
      saveOutings(storage, person.id, removeOuting(outings, id));
    },
  };
}
