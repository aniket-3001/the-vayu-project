import { Trash2, X } from 'lucide-react';
import { useEffect } from 'react';
import type { PlaceMatch } from '../../data/geocode';
import type { Pin } from '../../data/pins';
import { DAY_LABELS, personaBlurb, type Person } from '../people';
import type { Spot, SpotKind, Spots } from '../spots';
import type { Unit } from '../units';
import type { LiveState } from '../useExposure';
import { LiveCard } from './LiveCard';
import { SpotSection } from './SpotSection';

/**
 * One person's timetable: where their day goes, and the hours at each place. Opened by pressing them in the
 * list, so the main screen stays about the air they breathed and not about setting things up.
 */
export function PersonPanel({
  person,
  kinds,
  spots,
  pins,
  units,
  isMe,
  live,
  canRemove,
  onSet,
  onClear,
  onAddPin,
  onRemove,
  onClose,
  search,
}: {
  readonly person: Person;
  readonly kinds: readonly SpotKind[];
  readonly spots: Spots;
  readonly pins: readonly Pin[];
  readonly units: readonly Unit[];
  /** Only the person using the phone has live location. */
  readonly isMe: boolean;
  readonly live: {
    readonly state: LiveState;
    readonly sample: boolean;
    readonly hours: number;
    readonly start: () => void;
    readonly stop: () => void;
    readonly showSample: () => void;
    readonly clear: () => void;
  };
  readonly canRemove: boolean;
  readonly onSet: (kind: SpotKind, spot: Spot) => void;
  readonly onClear: (kind: SpotKind) => void;
  readonly onAddPin: (place: PlaceMatch) => void;
  readonly onRemove: () => void;
  readonly onClose: () => void;
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div
        className="sheet person-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-title"
      >
        <div className="sheet-head">
          <div>
            <h2 id="person-title">{person.name}’s day</h2>
            <p className="muted small">
              {person.age}, {DAY_LABELS[person.day].toLowerCase()}. {personaBlurb(person)}.
            </p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {kinds.map((kind) => (
          <SpotSection
            key={`${person.id}-${kind}`}
            kind={kind}
            spot={spots[kind]}
            pins={pins}
            units={units}
            onSet={(spot) => {
              onSet(kind, spot);
            }}
            onClear={() => {
              onClear(kind);
            }}
            onAddPin={onAddPin}
            {...(search !== undefined ? { search } : {})}
          />
        ))}
        {isMe && (
          <LiveCard
            state={live.state}
            sample={live.sample}
            hours={live.hours}
            onStart={live.start}
            onStop={live.stop}
            onSample={live.showSample}
            onClear={live.clear}
          />
        )}
        <div className="form-actions">
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
          {canRemove && (
            <button
              type="button"
              className="plain"
              aria-label={`Remove ${person.name}`}
              onClick={onRemove}
            >
              <Trash2 size={14} aria-hidden="true" /> Remove {person.name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
