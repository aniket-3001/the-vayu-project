import { useState } from 'react';
import type { PlaceMatch } from '../../data/geocode';
import { PlacePicker } from '../../exposure/ui/PlacePicker';
import type { Locate } from '../locate';
import { LabelForm } from './LabelForm';

/** A place found, not yet named. */
export interface FoundPlace {
  readonly name: string;
  readonly detail?: string;
  readonly lat: number;
  readonly lng: number;
}

/**
 * Add a place in two steps. First, where: use where you are, or search for it by name. Then what to call it: Home,
 * School, Office, Park or a name of your own. It opens at the second step when a place is already chosen.
 */
export function AddPlaceSheet({
  initial,
  search,
  locate,
  onSave,
  onCancel,
}: {
  readonly initial?: FoundPlace | undefined;
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
  readonly locate?: Locate;
  readonly onSave: (label: string, place: FoundPlace) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const [found, setFound] = useState<FoundPlace | undefined>(initial);
  return (
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <div
        className="sheet here-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={found === undefined ? 'Add a place' : 'Name this place'}
      >
        {found === undefined ? (
          <>
            <h2>Add a place</h2>
            <p className="muted">Use where you are, or search for it.</p>
            <PlacePicker
              name="Here"
              pins={[]}
              {...(search !== undefined ? { search } : {})}
              {...(locate !== undefined ? { locate } : {})}
              onPick={(pin) => {
                setFound({
                  name: pin.name,
                  ...(pin.detail === undefined || pin.detail === 'Detected'
                    ? { detail: 'Your location' }
                    : { detail: pin.detail }),
                  lat: pin.lat,
                  lng: pin.lng,
                });
              }}
              onCancel={onCancel}
            />
          </>
        ) : (
          <>
            <h2>What do you call it?</h2>
            <p className="here-found">
              <strong>{found.name}</strong>
              {found.detail !== undefined && found.detail !== '' && (
                <span className="muted small"> · {found.detail}</span>
              )}
            </p>
            <LabelForm
              onSave={(label) => {
                onSave(label, found);
              }}
            />
            <button type="button" className="plain" onClick={onCancel}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
