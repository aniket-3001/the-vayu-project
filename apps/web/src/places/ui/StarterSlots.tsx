import { useState } from 'react';
import type { PlaceMatch } from '../../data/geocode';
import type { Pin } from '../../data/pins';
import { PlacePicker } from '../../exposure/ui/PlacePicker';
import { PlaceSlot, SLOT_NAMES } from '../../exposure/ui/PlaceSlot';
import type { SpotKind } from '../../exposure/spots';
import type { Locate } from '../locate';

/** The four places most people want, in the order they are laid out. Office is the place of work; Park is outdoors. */
export const STARTER_KINDS: readonly SpotKind[] = ['home', 'school', 'work', 'outdoor'];

/** Which of the four a pin stands in for, by its name, or undefined for any other place. */
export function starterKindOf(pin: Pin): SpotKind | undefined {
  const name = pin.name.trim().toLowerCase();
  return STARTER_KINDS.find((kind) => SLOT_NAMES[kind].toLowerCase() === name);
}

/**
 * One of the four places as a dotted blue square, an input field: tap it and say where, by using where you are or
 * by search. Once it is set, a card takes its place; take the card away and the square comes back.
 */
export function StarterSlot({
  kind,
  onSet,
  search,
  locate,
}: {
  readonly kind: SpotKind;
  readonly onSet: (name: string, place: { lat: number; lng: number; detail?: string }) => void;
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
  readonly locate?: Locate;
}): React.JSX.Element {
  const [picking, setPicking] = useState(false);
  const name = SLOT_NAMES[kind];
  return (
    <li className="starter-slot">
      <PlaceSlot
        kind={kind}
        pin={undefined}
        active={picking}
        onPress={() => {
          setPicking(true);
        }}
      />
      {picking && (
        <div
          className="sheet-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPicking(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setPicking(false);
          }}
        >
          <div className="sheet" role="dialog" aria-modal="true" aria-label={`Where is ${name}?`}>
            <h2>Where is {name}?</h2>
            <PlacePicker
              name={name}
              pins={[]}
              {...(search !== undefined ? { search } : {})}
              {...(locate !== undefined ? { locate } : {})}
              onPick={(pin) => {
                onSet(name, {
                  lat: pin.lat,
                  lng: pin.lng,
                  ...(pin.detail === undefined || pin.detail === 'Detected'
                    ? {}
                    : { detail: pin.detail }),
                });
                setPicking(false);
              }}
              onCancel={() => {
                setPicking(false);
              }}
            />
          </div>
        </div>
      )}
    </li>
  );
}
