import { Briefcase, House, TreePine, type LucideIcon } from 'lucide-react';

/** The three places a day is made of, which are asked for once when the app is first set up. */
export type SetupKind = 'home' | 'workschool' | 'park';

export const SETUP_KINDS: readonly SetupKind[] = ['home', 'workschool', 'park'];

const WORDS: Readonly<Record<SetupKind, { title: string; hint: string; Icon: LucideIcon }>> = {
  home: { title: 'Home', hint: 'Where you live', Icon: House },
  workschool: { title: 'Work or school', hint: 'Where you spend the day', Icon: Briefcase },
  park: { title: 'Park', hint: 'Where you go outdoors', Icon: TreePine },
};

/**
 * An input field of the first set-up: a dotted blue square that asks for one place. Tap it, say where, and it becomes
 * that place's card.
 */
export function SetupField({
  kind,
  onPress,
}: {
  readonly kind: SetupKind;
  readonly onPress: () => void;
}): React.JSX.Element {
  const { title, hint, Icon } = WORDS[kind];
  return (
    <li className="add-place setup-field">
      <button type="button" aria-label={`Set ${title}`} onClick={onPress}>
        <span className="add-place-plus">
          <Icon size={28} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <strong>{title}</strong>
        <span className="muted small">+ {hint}</span>
      </button>
    </li>
  );
}
