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
import { AddPlaceSheet, type FoundPlace } from './AddPlaceSheet';

/** Your places, each a card in the colour of its air. Tap one for its day. */
export function PlacesPanel({
  search,
  locate = browserLocate,
  children,
}: {
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
  readonly locate?: Locate;
  /** What follows the places on the page: today's alerts and tips, kept below so the places come first. */
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const { pins, add, remove } = usePins();
  const live = useLiveLocation();
  const livePin = useLivePin();
  const [note, setNote] = useState('');
  // Adding a place: a search result waiting for a name, or the empty add card opened.
  const [adding, setAdding] = useState<{ readonly place?: FoundPlace } | undefined>(undefined);
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
            add({
              name: label,
              detail: 'Pinned from your location',
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
          {...(search !== undefined ? { search } : {})}
          locate={locate}
          onSave={(label, place) => {
            add({
              name: label,
              detail: [place.name !== label ? place.name : undefined, place.detail]
                .filter((part): part is string => part !== undefined && part !== '')
                .join(', '),
              lat: place.lat,
              lng: place.lng,
            });
            setAdding(undefined);
          }}
          onCancel={() => {
            setAdding(undefined);
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
