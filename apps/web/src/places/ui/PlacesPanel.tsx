import { LocateFixed } from 'lucide-react';
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

/** Your places, each a card in the colour of its air. Tap one for its day. */
export function PlacesPanel({
  search,
  locate = browserLocate,
}: {
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
  readonly locate?: Locate;
}): React.JSX.Element {
  const { pins, add, remove } = usePins();
  const live = useLiveLocation();
  const livePin = useLivePin();
  const [note, setNote] = useState('');
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
          add(match);
        }}
      />
      <button type="button" className="locate" onClick={detect}>
        <LocateFixed size={20} strokeWidth={1.75} aria-hidden="true" />
        Detect me
      </button>
      <p className="muted small" role="status">
        {note}
      </p>
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
      {pins.length === 0 && livePin === undefined ? (
        <p className="empty">
          Nothing pinned yet. Search for a place above, or detect where you are.
        </p>
      ) : (
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
        </ul>
      )}
      <p className="muted small places-note">
        {airStore().kind === 'sample' ? (
          <>
            <Pill>Sample data</Pill> The readings here are made up.{' '}
          </>
        ) : (
          <>
            <Pill>Live</Pill> Each reading is the nearest monitor with a recent one, and says how
            far and how old.{' '}
          </>
        )}
        Pinned places are saved on this device only. Up to {MAX_PINS}. Search sends just the name
        you type to Photon, the OpenStreetMap search. We show the nearest monitor within 25 km and
        say how far it is; where there is none, an estimate from the regional model, which uses
        satellite data.
      </p>
    </div>
  );
}
