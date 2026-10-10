import { Briefcase, GraduationCap, House, Plus, TreePine, type LucideIcon } from 'lucide-react';
import type { Pin } from '../../data/pins';
import { SPOT_LABELS, type SpotKind } from '../spots';

const ICONS: Readonly<Record<SpotKind, LucideIcon>> = {
  home: House,
  work: Briefcase,
  school: GraduationCap,
  outdoor: TreePine,
};

/** What each kind is called on a slot: work is the office, outdoor is the park. */
export const SLOT_NAMES: Readonly<Record<SpotKind, string>> = {
  home: SPOT_LABELS.home,
  school: SPOT_LABELS.school,
  work: 'Office',
  outdoor: 'Park',
};

/**
 * A place to fill in, as a square. Empty it is dotted, with a plus: tap it to say where. Filled it shows the name it
 * was given and where it is, and tapping it changes it.
 */
export function PlaceSlot({
  kind,
  pin,
  active,
  onPress,
}: {
  readonly kind: SpotKind;
  readonly pin: Pin | undefined;
  readonly active: boolean;
  readonly onPress: () => void;
}): React.JSX.Element {
  const Icon = ICONS[kind];
  const name = SLOT_NAMES[kind];
  return (
    <button
      type="button"
      className={`slot${pin === undefined ? ' empty' : ' set'}${active ? ' active' : ''}`}
      aria-label={pin === undefined ? `Set ${name}` : `${name}: ${pin.name}. Change`}
      aria-pressed={active}
      onClick={onPress}
    >
      <span className="slot-icon">
        <Icon size={26} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <strong>{name}</strong>
      {pin === undefined ? (
        <span className="slot-hint">
          <Plus size={14} strokeWidth={2.5} aria-hidden="true" /> Add location
        </span>
      ) : (
        <span className="slot-hint">{pin.name}</span>
      )}
    </button>
  );
}
