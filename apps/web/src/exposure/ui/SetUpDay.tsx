import { useState } from 'react';
import type { PlaceMatch } from '../../data/geocode';
import type { Pin } from '../../data/pins';
import type { SpotKind } from '../spots';
import { PlacePicker } from './PlacePicker';
import { PlaceSlot, SLOT_NAMES } from './PlaceSlot';

/**
 * Shown while a day has no places: dotted blue squares for where the day is spent, so the dial has something to
 * show. Tap one to say where; it is then drawn on the dial.
 */
export function SetUpDay({
  name,
  kinds,
  pins,
  onSet,
  onAddPin,
  search,
}: {
  /** "your" or "Asha’s". */
  readonly name: string;
  readonly kinds: readonly SpotKind[];
  readonly pins: readonly Pin[];
  readonly onSet: (kind: SpotKind, pin: Pin) => void;
  readonly onAddPin?: (place: PlaceMatch) => void;
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
}): React.JSX.Element {
  const [picking, setPicking] = useState<SpotKind | undefined>(undefined);
  return (
    <section className="setup-day" aria-label="Set where the day is spent">
      <h2>Where is {name} day spent?</h2>
      <p className="muted small">
        Tap a square to set a place. The dial below fills in from the air there.
      </p>
      <div className="slots blue">
        {kinds.map((kind) => (
          <PlaceSlot
            key={kind}
            kind={kind}
            pin={undefined}
            active={picking === kind}
            onPress={() => {
              setPicking(picking === kind ? undefined : kind);
            }}
          />
        ))}
      </div>
      {picking !== undefined && (
        <PlacePicker
          name={SLOT_NAMES[picking]}
          pins={pins}
          {...(onAddPin !== undefined ? { onAddPin } : {})}
          {...(search !== undefined ? { search } : {})}
          onPick={(pin) => {
            onSet(picking, pin);
            setPicking(undefined);
          }}
          onCancel={() => {
            setPicking(undefined);
          }}
        />
      )}
    </section>
  );
}
