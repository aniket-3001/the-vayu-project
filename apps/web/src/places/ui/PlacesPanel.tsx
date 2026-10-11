import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { airStore } from '../../air/store';
import { addressOf, type PlaceMatch } from '../../data/geocode';
import { MAX_PINS, type Pin } from '../../data/pins';
import { addPerson, loadHousehold, saveHousehold, type Person } from '../../exposure/people';
import { saveSpots } from '../../exposure/spots';
import { AddPerson } from '../../exposure/ui/AddPerson';
import { Pill } from '../../today/ui/Chip';
import { useLiveLocation, useLivePin } from '../liveLocation';
import { browserLocate, type Locate } from '../locate';
import {
  assignRoleFor,
  clearRole,
  defaultsFor,
  pinForRole,
  roleOfLabel,
  samePlace,
  type Role,
} from '../roles';
import { usePins } from '../usePins';
import { AddPlaceSheet, type FoundPlace } from './AddPlaceSheet';
import { PlaceCard, markDragEnd } from './PlaceCard';
import { SETUP_KINDS, SetupField, type SetupKind } from './SetupField';

/** A saved place's card that can be dragged to another spot in the grid. */
function SortableCard({
  pin,
  onRemove,
}: {
  readonly pin: Pin;
  readonly onRemove: (pin: Pin) => void;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pin.id,
  });
  return (
    <PlaceCard
      pin={pin}
      onRemove={onRemove}
      drag={{
        setNodeRef,
        style: {
          transform: CSS.Transform.toString(transform),
          transition,
          zIndex: isDragging ? 5 : 'auto',
        },
        attributes,
        listeners,
        dragging: isDragging,
      }}
    />
  );
}

/**
 * Your places, each a card in the colour of its air. The first card is the one that adds a place. The live card, while
 * live location is on, says what it is the same as. Saved places can be dragged to a new place in the grid: they snap
 * to it, and the order is kept.
 */
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
  const { pins, add, remove, move } = usePins();
  const live = useLiveLocation();
  const livePin = useLivePin();
  // Adding a place: a search result waiting for a name, the add card opened, or one of the set-up fields.
  const [adding, setAdding] = useState<
    { readonly place?: FoundPlace; readonly setup?: SetupKind } | undefined
  >(undefined);
  // A place with a role was just named: who is it for, then, if someone new, their name and age.
  const [whoFor, setWhoFor] = useState<
    { readonly label: string; readonly place: FoundPlace; readonly role: Role } | undefined
  >(undefined);
  const [ticked, setTicked] = useState<readonly string[]>([]);
  const [newPersonAt, setNewPersonAt] = useState<
    { readonly pin: Pin; readonly role: Role } | undefined
  >(undefined);
  const [liveAddress, setLiveAddress] = useState<string | undefined>(undefined);

  // The first set-up asks for home, work or school, and a park, until each is given.
  const unset = SETUP_KINDS.filter((kind) =>
    kind === 'home'
      ? pinForRole('home', pins) === undefined
      : kind === 'park'
        ? pinForRole('outdoor', pins) === undefined
        : pinForRole('work', pins) === undefined && pinForRole('school', pins) === undefined,
  );
  const settingUp = unset.length > 0;
  const homePin = pinForRole('home', pins);
  const homePlace: { home?: Pin } = homePin === undefined ? {} : { home: homePin };

  // The live card's address, from where the device is, looked up once for each place it stops at.
  const liveLat = livePin?.lat;
  const liveLng = livePin?.lng;
  useEffect(() => {
    if (liveLat === undefined || liveLng === undefined) {
      setLiveAddress(undefined);
      return undefined;
    }
    let current = true;
    address(liveLat, liveLng).then(
      (found) => {
        if (current) setLiveAddress(found);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [liveLat, liveLng, address]);
  // Where the device really is (not the rounded place the card is drawn for) against each saved place, to within
  // about half a kilometre, which is as close as a coarse fix can tell.
  const here = live.position;
  const sameAs =
    livePin === undefined || here === undefined
      ? undefined
      : pins.find((pin) => samePlace(pin, here, 0.005))?.name;
  const liveCard = useMemo(
    () =>
      livePin === undefined
        ? undefined
        : { ...livePin, detail: liveAddress ?? 'Finding the address…' },
    [livePin, liveAddress],
  );

  /**
   * Pins a place under its name, with its address, and puts it in the day of everyone it is for. `forPeople` is who
   * (ids); none pins it only, to watch the air.
   */
  const pinPlace = async (
    label: string,
    place: FoundPlace,
    forPeople: readonly string[] = [],
  ): Promise<Pin> => {
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
    for (const personId of forPeople) assignRoleFor(window.localStorage, personId, label, full);
    return full;
  };

  const people = loadHousehold(window.localStorage).people;
  const personName = (person: Person): string => (person.id === 'me' ? 'Me' : person.name);

  const sensors = useSensors(
    // A mouse drags after a few pixels; a finger after a short hold, so the page still scrolls.
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (event: DragEndEvent): void => {
    markDragEnd();
    const { active, over } = event;
    if (over !== null && active.id !== over.id) move(String(active.id), String(over.id));
  };

  return (
    <div className="panel">
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
          onLive={() => {
            live.set(true);
            setAdding(undefined);
          }}
          onSave={(label, place) => {
            setAdding(undefined);
            const role = roleOfLabel(label);
            // A place that is not home, work, school or park is just a place to watch.
            if (role === undefined) {
              void pinPlace(label, place);
              return;
            }
            // With only you in the family, it is yours (a school asks, since it may be a child's).
            if (people.length === 1 && role !== 'school') {
              void pinPlace(label, place, ['me']);
              return;
            }
            setTicked(defaultsFor(role, people));
            setWhoFor({ label, place, role });
          }}
          onCancel={() => {
            setAdding(undefined);
          }}
        />
      )}
      {whoFor !== undefined && (
        <div
          className="sheet-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setWhoFor(undefined);
          }}
        >
          <div
            className="sheet here-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Who is this for?"
          >
            <h2>Who is this for?</h2>
            <p className="here-found">
              <strong>{whoFor.label}</strong>
              <span className="muted small"> · {whoFor.place.name}</span>
            </p>
            <ul className="who-list">
              {people.map((person) => (
                <li key={person.id}>
                  {/* The name sits in the span beside the box, which the rule cannot see. */}
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label className="map-toggle">
                    <input
                      type="checkbox"
                      checked={ticked.includes(person.id)}
                      onChange={(event) => {
                        setTicked((current) =>
                          event.target.checked
                            ? [...current, person.id]
                            : current.filter((id) => id !== person.id),
                        );
                      }}
                    />
                    <span>
                      <strong>{personName(person)}</strong>
                      <span className="muted small">
                        {' '}
                        {person.id === 'me' ? 'the phone’s owner' : String(person.age)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="form-actions">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const chosen = whoFor;
                  const forPeople = ticked;
                  setWhoFor(undefined);
                  void pinPlace(chosen.label, chosen.place, forPeople);
                }}
              >
                {ticked.length === 0 ? 'Just watch the air' : 'Done'}
              </button>
              <button
                type="button"
                className="plain"
                onClick={() => {
                  const chosen = whoFor;
                  const forPeople = ticked;
                  setWhoFor(undefined);
                  void pinPlace(chosen.label, chosen.place, forPeople).then((pin) => {
                    setNewPersonAt({ pin, role: chosen.role });
                  });
                }}
              >
                Someone new
              </button>
            </div>
          </div>
        </div>
      )}
      {newPersonAt !== undefined && (
        <AddPerson
          title={`Add the person for ${newPersonAt.pin.name}`}
          blurb="Their name and age add them to your family, so their day shows in Exposure and in your tips."
          pins={pins}
          {...(search !== undefined ? { search } : {})}
          preset={{
            ...(newPersonAt.role === 'school'
              ? { day: 'school' as const }
              : newPersonAt.role === 'work'
                ? { day: 'work' as const }
                : {}),
            places: {
              [newPersonAt.role]: newPersonAt.pin,
              ...(newPersonAt.role === 'home' ? {} : homePlace),
            },
          }}
          onClose={() => {
            setNewPersonAt(undefined);
          }}
          onAdd={(details, spots) => {
            // Added to the family without changing who Exposure is looking at.
            const household = loadHousehold(window.localStorage);
            const next = addPerson(household, details);
            const created = next.people.find((p) => !household.people.some((o) => o.id === p.id));
            saveHousehold(window.localStorage, { ...next, current: household.current });
            if (created !== undefined) saveSpots(window.localStorage, created.id, spots);
            setNewPersonAt(undefined);
          }}
        />
      )}
      {/* The dragging library puts its own helper elements beside the list, so it wraps the list, not fills it. */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <ul className="place-grid" aria-label="Your places">
          {pins.length < MAX_PINS && (
            <li className="add-place add-first">
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
                <span className="muted small">Search, or detect where you are</span>
              </button>
            </li>
          )}
          {liveCard !== undefined && <PlaceCard key="live" pin={liveCard} live={{ sameAs }} />}
          <SortableContext items={pins.map((p) => p.id)} strategy={rectSortingStrategy}>
            {pins.map((pin) => (
              <SortableCard
                key={pin.id}
                pin={pin}
                onRemove={(p) => {
                  remove(p.id);
                  clearRole(window.localStorage, p.name);
                }}
              />
            ))}
          </SortableContext>
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
        </ul>
      </DndContext>
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
        Places are saved on this device only (up to {MAX_PINS}). Drag a card to put it where you
        want it.
      </p>
    </div>
  );
}
