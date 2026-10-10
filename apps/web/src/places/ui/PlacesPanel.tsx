import { LocateFixed } from 'lucide-react';
import { useState } from 'react';
import { inCoverage, type PlaceMatch } from '../../data/geocode';
import { MAX_PINS } from '../../data/pins';
import { Pill } from '../../today/ui/Chip';
import { airStore } from '../../air/store';
import { usePins } from '../usePins';
import { PlaceCard } from './PlaceCard';
import { PlaceSearch } from './PlaceSearch';

type Locate = (onFound: (lat: number, lng: number) => void, onFail: () => void) => void;

const browserLocate: Locate = (onFound, onFail) => {
  if (!('geolocation' in navigator)) {
    onFail();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      onFound(position.coords.latitude, position.coords.longitude);
    },
    onFail,
    { timeout: 10_000 },
  );
};

/** Your places, each a card in the colour of its air. Tap one for its day. */
export function PlacesPanel({
  search,
  locate = browserLocate,
}: {
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
  readonly locate?: Locate;
}): React.JSX.Element {
  const { pins, add, remove } = usePins();
  const [note, setNote] = useState('');

  const useMyLocation = (): void => {
    setNote('Finding where you are…');
    locate(
      (lat, lng) => {
        if (!inCoverage(lat, lng)) {
          setNote('You are outside the area our monitors cover, which is north India.');
          return;
        }
        add({ name: 'Near you', detail: 'Your location', lat, lng });
        setNote('');
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
      <button type="button" className="locate" onClick={useMyLocation}>
        <LocateFixed size={20} strokeWidth={1.75} aria-hidden="true" />
        Use my location
      </button>
      <p className="muted small" role="status">
        {note}
      </p>
      {pins.length === 0 ? (
        <p className="empty">Nothing pinned yet. Search for a place above, or use your location.</p>
      ) : (
        <ul className="place-grid" aria-label="Your places">
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
        you type to Open-Meteo.
      </p>
    </div>
  );
}
