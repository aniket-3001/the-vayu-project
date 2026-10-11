import { LocateFixed, Plus } from 'lucide-react';
import { useState } from 'react';
import { inCoverage, type PlaceMatch } from '../../data/geocode';
import { MAX_PINS } from '../../data/pins';
import { Pill } from '../../today/ui/Chip';
import { airStore } from '../../air/store';
import { useLiveLocation, useLivePin } from '../liveLocation';
import { HereSheet } from './HereSheet';
import { usePins } from '../usePins';
import { PlaceCard } from './PlaceCard';
import { browserLocate, type Locate } from '../locate';
import { PlaceSearch } from './PlaceSearch';
import { addressOf } from '../../data/geocode';
import { assignRole, clearRole, pinForRole, roleOfLabel } from '../roles';
import { AddPerson } from '../../exposure/ui/AddPerson';
import { addPerson, loadHousehold, saveHousehold } from '../../exposure/people';
import { saveSpots } from '../../exposure/spots';
import type { Pin } from '../../data/pins';
import { AddPlaceSheet, type FoundPlace } from './AddPlaceSheet';
import { SETUP_KINDS, SetupField, type SetupKind } from './SetupField';

/** Your places, each a card in the colour of its air. Tap one for its day. */
export function PlacesPanel({
  search,
  locate = browserLocate,
  address = addressOf,
  children,
}: {
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
  readonly locate?: Locate;
  /** Turns a point into an address, for a place found by location. */
  readonly address?: (lat: number, lng: number) => Promise<string | undefined>;
  /** What follows the places on the page: today's alerts and tips, kept below so the places come first. */
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const { pins, add, remove } = usePins();
  const live = useLiveLocation();
  const livePin = useLivePin();
  const [note, setNote] = useState('');
  // Adding a place: a search result waiting for a name, the empty add card opened, or one of the set-up fields.
  const [adding, setAdding] = useState<
    { readonly place?: FoundPlace; readonly setup?: SetupKind } | undefined
  >(undefined);
  // The first set-up asks for home, work or school, and a park, until each is given.
  const unset = SETUP_KINDS.filter((kind) =>
    kind === 'home'
      ? pinForRole('home', pins) === undefined
      : kind === 'park'
        ? pinForRole('outdoor', pins) === undefined
        : pinForRole('work', pins) === undefined && pinForRole('school', pins) === undefined,
  );
  const settingUp = unset.length > 0;

  // A school was just set: who goes there, then, if it is a child, their name and age to add to the family.
  const [whoGoes, setWhoGoes] = useState<
    { readonly label: string; readonly place: FoundPlace } | undefined
  >(undefined);
  const [childAt, setChildAt] = useState<Pin | undefined>(undefined);

  /**
   * Pins a place under its name, with its address, and makes it count in the day if the name is a role. `assign`
   * false pins it without putting it in the phone owner's own day, for a school a child goes to.
   */
  const pinPlace = async (label: string, place: FoundPlace, assign = true): Promise<Pin> => {
    // A place found by location has no address yet: look one up, and keep our words if there is none.
    const looked =
      place.detail === 'Your location' ? await address(place.lat, place.lng) : undefined;
    const detail = [
      place.name !== label && place.detail !== 'Your location' ? place.name : undefined,
      looked ?? place.detail,
    ]
      .filter((part): part is string => part !== undefined && part !== '')
      .join(', ');
    const pin = { name: label, detail, lat: place.lat, lng: place.lng };
    add(pin);
    const full: Pin = { ...pin, id: `${place.lat.toFixed(2)},${place.lng.toFixed(2)}` };
    if (assign) assignRole(window.localStorage, label, full);
    return full;
  };
  const homePin = pinForRole('home', pins);
  const homePlace: { home?: Pin } = homePin === undefined ? {} : { home: homePin };
  const [found, setFound] = useState<{ readonly lat: number; readonly lng: number } | undefined>(
    undefined,
  );

  const detect = (): void => {
    setNote('Finding where you are…');
    locate(
      (lat, lng) => {
        setNote('');
        setFound({ lat, lng });
      },
      () => {
        setNote('We could not get your location. You can still search for a place by name.');
      },
    );
  };

  return (
    <div className="panel">
      <PlaceSearch
        {...(search !== undefined ? { search } : {})}
        onPick={(match) => {
          // A place found by search is asked for a name before it is pinned.
          setAdding({
            place: {
              name: match.name,
              ...(match.detail === '' ? {} : { detail: match.detail }),
              lat: match.lat,
              lng: match.lng,
            },
          });
        }}
        trailing={
          <button
            type="button"
            className="locate-round"
            aria-label="Detect me"
            title="Detect where I am"
            onClick={detect}
          >
            <LocateFixed size={22} strokeWidth={1.9} aria-hidden="true" />
          </button>
        }
      />
      <span className="locate-hint" aria-hidden="true">
        Detect my location
      </span>
      {note !== '' && (
        <p className="muted small" role="status">
          {note}
        </p>
      )}
      {found !== undefined && (
        <HereSheet
          {...(inCoverage(found.lat, found.lng)
            ? {}
            : {
                note: 'You are outside north India. We can still show an estimate, but no monitors are near.',
              })}
          onLive={() => {
            live.set(true);
            setFound(undefined);
          }}
          onPin={(label) => {
            void pinPlace(label, {
              name: label,
              detail: 'Your location',
              lat: found.lat,
              lng: found.lng,
            });
            setFound(undefined);
          }}
          onCancel={() => {
            setFound(undefined);
          }}
        />
      )}
      {live.status === 'refused' && (
        <p className="muted small" role="status">
          Your browser did not share your location, so live location is off.
        </p>
      )}
      {adding !== undefined && (
        <AddPlaceSheet
          initial={adding.place}
          {...(adding.setup === 'home'
            ? { title: 'Where is home?', fixedLabel: 'Home' }
            : adding.setup === 'park'
              ? { title: 'Where is the park you go to?', fixedLabel: 'Park' }
              : adding.setup === 'workschool'
                ? { title: 'Where do you work or study?', choices: ['Work', 'School'] }
                : {})}
          {...(search !== undefined ? { search } : {})}
          locate={locate}
          onSave={(label, place) => {
            setAdding(undefined);
            // A school may be the owner's or a child's, so it is asked who goes there.
            if (roleOfLabel(label) === 'school') setWhoGoes({ label, place });
            else void pinPlace(label, place);
          }}
          onCancel={() => {
            setAdding(undefined);
          }}
        />
      )}
      {whoGoes !== undefined && (
        <div
          className="sheet-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setWhoGoes(undefined);
          }}
        >
          <div
            className="sheet here-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Who goes to this school?"
          >
            <h2>Who goes to this school?</h2>
            <p className="here-found">
              <strong>{whoGoes.place.name}</strong>
            </p>
            <div className="choice-row">
              <button
                type="button"
                className="choice"
                onClick={() => {
                  const chosen = whoGoes;
                  setWhoGoes(undefined);
                  void pinPlace(chosen.label, chosen.place, true);
                }}
              >
                I do
              </button>
              <button
                type="button"
                className="choice"
                onClick={() => {
                  const chosen = whoGoes;
                  setWhoGoes(undefined);
                  void pinPlace(chosen.label, chosen.place, false).then(setChildAt);
                }}
              >
                My child
              </button>
              <button
                type="button"
                className="choice"
                onClick={() => {
                  const chosen = whoGoes;
                  setWhoGoes(undefined);
                  void pinPlace(chosen.label, chosen.place, false);
                }}
              >
                Just watch the air
              </button>
            </div>
          </div>
        </div>
      )}
      {childAt !== undefined && (
        <AddPerson
          title={`Add the child who goes to ${childAt.name}`}
          blurb="Their name and age add them to your family, so their school day shows in Exposure and in your tips."
          pins={pins}
          {...(search !== undefined ? { search } : {})}
          preset={{
            day: 'school',
            places: { school: childAt, ...homePlace },
          }}
          onClose={() => {
            setChildAt(undefined);
          }}
          onAdd={(details, spots) => {
            // Added to the family without changing who Exposure is looking at.
            const household = loadHousehold(window.localStorage);
            const next = addPerson(household, details);
            const created = next.people.find((p) => !household.people.some((o) => o.id === p.id));
            saveHousehold(window.localStorage, { ...next, current: household.current });
            if (created !== undefined) saveSpots(window.localStorage, created.id, spots);
            setChildAt(undefined);
          }}
        />
      )}
      <ul className="place-grid" aria-label="Your places">
        {livePin !== undefined && <PlaceCard key="live" pin={livePin} />}
        {pins.map((pin) => (
          <PlaceCard
            key={pin.id}
            pin={pin}
            onRemove={(p) => {
              remove(p.id);
              clearRole(window.localStorage, p.name);
            }}
          />
        ))}
        {settingUp &&
          unset.map((kind) => (
            <SetupField
              key={kind}
              kind={kind}
              onPress={() => {
                setAdding({ setup: kind });
              }}
            />
          ))}
        {pins.length < MAX_PINS && (
          <li className="add-place">
            <button
              type="button"
              aria-label="Add a place"
              onClick={() => {
                setAdding({});
              }}
            >
              <span className="add-place-plus">
                <Plus size={30} strokeWidth={2.25} aria-hidden="true" />
              </span>
              <strong>Add a place</strong>
              <span className="muted small">Home, school, office, a park…</span>
            </button>
          </li>
        )}
      </ul>
      {children}
      <p className="muted small places-note">
        {airStore().kind === 'sample' ? (
          <>
            <Pill>Sample data</Pill> The readings here are made up.{' '}
          </>
        ) : (
          <>
            <Pill>Live</Pill> Each reading is the nearest monitor within 25 km, with how far and how
            old. Where there is none, it is a regional estimate.{' '}
          </>
        )}
        Places are saved on this device only (up to {MAX_PINS}).
      </p>
    </div>
  );
}
