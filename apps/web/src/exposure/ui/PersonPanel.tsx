import { isOriginalSpot } from '../../week/protect';
import { Trash2, TreePine, X } from 'lucide-react';
import { useEffect } from 'react';
import type { PlaceMatch } from '../../data/geocode';
import type { Pin } from '../../data/pins';
import { DAY_LABELS, personaBlurb, type Person } from '../people';
import { ACTIVITY_LABELS, clockWords, type Outing } from '../outings';
import { formatDate } from '../model';
import type { Spot, SpotKind, Spots } from '../spots';
import type { Unit } from '../units';
import type { LiveState } from '../useExposure';
import { LiveCard } from './LiveCard';
import { SpotSection } from './SpotSection';
import { ActivityIcon } from './OutingSheet';

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
  outings,
  onLog,
  onRemoveOuting,
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
    readonly showSample: (() => void) | undefined;
    readonly clear: () => void;
  };
  readonly canRemove: boolean;
  /** What has been logged outdoors for this person. */
  readonly outings: readonly Outing[];
  readonly onLog: () => void;
  readonly onRemoveOuting: (id: string) => void;
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
            <h2 id="person-title">{person.id === 'me' ? 'My day' : `${person.name}’s day`}</h2>
            <p className="muted small">
              {person.age}, {DAY_LABELS[person.day].toLowerCase()}. {personaBlurb(person)}.
            </p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {kinds
          .filter((kind) => kind !== 'outdoor')
          .map((kind) => (
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
              locked={isOriginalSpot(person.id, spots[kind]?.pin)}
              {...(search !== undefined ? { search } : {})}
            />
          ))}
        {
          <section className="spot spot-set" aria-label="Outdoor time">
            <div className="spot-head">
              <span className="dc-icon spot-outdoor">
                <TreePine size={22} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div>
                <h2 className="spot-title">Outdoor time</h2>
                <p className="muted small">
                  {isMe
                    ? 'Your location logs this for you. Add anything it missed, or tell the assistant.'
                    : 'Walks, play, anything outside. Tell us where and for how long, or tell the assistant.'}
                </p>
              </div>
            </div>
            {outings.length > 0 && (
              <ul className="outing-list">
                {[...outings]
                  .sort((a, b) =>
                    a.date === b.date ? b.start - a.start : b.date.localeCompare(a.date),
                  )
                  .map((o) => (
                    <li key={o.id}>
                      <span className="outing-icon">
                        <ActivityIcon activity={o.activity} />
                      </span>
                      <span className="outing-words">
                        <strong>
                          {ACTIVITY_LABELS[o.activity]} in {o.pin.name}
                        </strong>
                        <span className="muted small">
                          {formatDate(o.date)}, {clockWords(o.start)}, {o.minutes} min
                        </span>
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove ${ACTIVITY_LABELS[o.activity].toLowerCase()} in ${o.pin.name}, ${formatDate(o.date)}`}
                        onClick={() => {
                          onRemoveOuting(o.id);
                        }}
                      >
                        <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            <button type="button" className="dashed" onClick={onLog}>
              <span className="dashed-icon">
                <TreePine size={20} strokeWidth={2} aria-hidden="true" />
              </span>
              Log outdoor time
            </button>
          </section>
        }
        {isMe && (
          <LiveCard
            state={live.state}
            sample={live.sample}
            hours={live.hours}
            onStart={live.start}
            onStop={live.stop}
            {...(live.showSample === undefined ? {} : { onSample: live.showSample })}
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
