import { useState } from 'react';
import type { PlaceMatch } from '../../data/geocode';
import type { Pin } from '../../data/pins';
import { PlacePicker } from '../../exposure/ui/PlacePicker';
import { PlaceSlot, SLOT_NAMES } from '../../exposure/ui/PlaceSlot';
import type { SpotKind } from '../../exposure/spots';
import type { Locate } from '../locate';

/** The places most people want, in the order to offer them. Office is the place of work; Park is outdoors. */
export const STARTER_KINDS: readonly SpotKind[] = ['home', 'school', 'work', 'outdoor'];

/** Which of the four are not pinned yet, by the name they would be pinned under. */
export function missingKinds(pins: readonly Pin[]): readonly SpotKind[] {
  const names = new Set(pins.map((p) => p.name.trim().toLowerCase()));
  return STARTER_KINDS.filter((kind) => !names.has(SLOT_NAMES[kind].toLowerCase()));
}

/**
 * Dotted blue squares for Home, School, Office and Park, each a place still to be set. Tapping one asks where: use
 * where you are now, or search. The square then becomes a card under that name.
 */
export function StarterSlots({
  pins,
  onSet,
  search,
  locate,
}: {
  readonly pins: readonly Pin[];
  readonly onSet: (name: string, place: { lat: number; lng: number; detail?: string }) => void;
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
  readonly locate?: Locate;
}): React.JSX.Element | null {
  const [picking, setPicking] = useState<SpotKind | undefined>(undefined);
  const missing = missingKinds(pins);
  if (missing.length === 0) return null;
  return (
    <>
      {missing.map((kind) => (
        <li key={kind} className="starter-slot">
          <PlaceSlot
            kind={kind}
            pin={undefined}
            active={picking === kind}
            onPress={() => {
              setPicking(kind);
            }}
          />
        </li>
      ))}
      {picking !== undefined && (
        <li className="starter-picker">
          <div
            className="sheet-backdrop"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) setPicking(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setPicking(undefined);
            }}
          >
            <div
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label={`Where is ${SLOT_NAMES[picking]}?`}
            >
              <h2>Where is {SLOT_NAMES[picking]}?</h2>
              <PlacePicker
                name={SLOT_NAMES[picking]}
                pins={[]}
                {...(search !== undefined ? { search } : {})}
                {...(locate !== undefined ? { locate } : {})}
                onPick={(pin) => {
                  onSet(SLOT_NAMES[picking], {
                    lat: pin.lat,
                    lng: pin.lng,
                    ...(pin.detail === undefined || pin.detail === 'Detected'
                      ? {}
                      : { detail: pin.detail }),
                  });
                  setPicking(undefined);
                }}
                onCancel={() => {
                  setPicking(undefined);
                }}
              />
            </div>
          </div>
        </li>
      )}
    </>
  );
}
