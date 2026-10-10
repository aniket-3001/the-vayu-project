import { LocateFixed } from 'lucide-react';
import { useState } from 'react';
import type { PlaceMatch } from '../../data/geocode';
import { pinId, type Pin } from '../../data/pins';
import { browserLocate, type Locate } from '../../places/locate';
import { PlaceSearch } from '../../places/ui/PlaceSearch';

/**
 * Where is this place? Three ways to say: one of your pinned places, where you are now (Detect me), or a search for
 * any place, a school or an office included. `name` is what a detected place is called, such as “Home”.
 */
export function PlacePicker({
  name,
  pins,
  onPick,
  onCancel,
  onAddPin,
  search,
  locate = browserLocate,
}: {
  readonly name: string;
  readonly pins: readonly Pin[];
  readonly onPick: (pin: Pin) => void;
  readonly onCancel: () => void;
  /** A place found by search is also kept among the pinned places. */
  readonly onAddPin?: (place: PlaceMatch) => void;
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
  readonly locate?: Locate;
}): React.JSX.Element {
  const [note, setNote] = useState('');
  const detect = (): void => {
    setNote('Finding where you are…');
    locate(
      (lat, lng) => {
        onPick({ id: pinId(lat, lng), name, detail: 'Detected', lat, lng });
      },
      () => {
        setNote('We could not get your location. You can search for the place instead.');
      },
    );
  };
  return (
    <div className="picker">
      <button type="button" className="locate" onClick={detect}>
        <LocateFixed size={20} strokeWidth={1.75} aria-hidden="true" />
        Detect me
      </button>
      <p className="muted small" role="status">
        {note}
      </p>
      {pins.length > 0 && (
        <>
          <p className="muted small">Or one of your places:</p>
          <ul className="choice-row">
            {pins.map((pin) => (
              <li key={pin.id}>
                <button
                  type="button"
                  className="choice"
                  onClick={() => {
                    onPick(pin);
                  }}
                >
                  {pin.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <PlaceSearch
        {...(search !== undefined ? { search } : {})}
        onPick={(match) => {
          onAddPin?.(match);
          onPick({
            id: pinId(match.lat, match.lng),
            name: match.name,
            ...(match.detail === '' ? {} : { detail: match.detail }),
            lat: match.lat,
            lng: match.lng,
          });
        }}
      />
      <button type="button" className="plain" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
