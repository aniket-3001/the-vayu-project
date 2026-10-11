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
  title = 'Add a place',
  fixedLabel,
  choices,
  onLive,
}: {
  readonly initial?: FoundPlace | undefined;
  /** What the sheet is for, when it is for one thing: “Where is home?”. */
  readonly title?: string;
  /** A name that is already decided, so the sheet asks only where. */
  readonly fixedLabel?: string;
  /** Only these names may be chosen, and none of your own: “Work” or “School”. */
  readonly choices?: readonly string[];
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
  readonly locate?: Locate;
  readonly onSave: (label: string, place: FoundPlace) => void;
  /** Offered when the place was found by Detect my location: follow the device instead of pinning it. */
  readonly onLive?: () => void;
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
        aria-label={found === undefined ? title : 'Name this place'}
      >
        {found === undefined ? (
          <>
            <h2>{title}</h2>
            <p className="muted">Detect where you are, or search for it.</p>
            <PlacePicker
              name="Here"
              pins={[]}
              {...(search !== undefined ? { search } : {})}
              {...(locate !== undefined ? { locate } : {})}
              onPick={(pin) => {
                const place: FoundPlace = {
                  name: pin.name,
                  ...(pin.detail === undefined || pin.detail === 'Detected'
                    ? { detail: 'Your location' }
                    : { detail: pin.detail }),
                  lat: pin.lat,
                  lng: pin.lng,
                };
                if (fixedLabel !== undefined) {
                  onSave(fixedLabel, place);
                  return;
                }
                setFound(place);
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
            {onLive !== undefined && found.detail === 'Your location' && (
              <button type="button" className="primary live-follow" onClick={onLive}>
                Follow me instead (live location)
              </button>
            )}
            <LabelForm
              {...(choices !== undefined ? { choices, custom: false } : {})}
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
