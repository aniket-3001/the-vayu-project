export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'vayu.theme.v1';

const isChoice = (value: unknown): value is ThemeChoice =>
  value === 'system' || value === 'light' || value === 'dark';

/** What the person picked on this device; "system" until they pick. Never throws: private windows can refuse storage. */
export function loadChoice(storage: Storage | undefined = safeStorage()): ThemeChoice {
  try {
    const stored = storage?.getItem(THEME_KEY);
    return isChoice(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function saveChoice(choice: ThemeChoice, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(THEME_KEY, choice);
  } catch {
    // The choice still applies for this visit.
  }
}

/** The look to show: the person's pick, or else what the device asks for. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  return choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const systemQuery = (): MediaQueryList | undefined =>
  typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined;

/** Puts the look on the page: styles key off `data-theme`, and the browser's own controls follow `color-scheme`. */
export function applyTheme(choice: ThemeChoice): Theme {
  const theme = resolveTheme(choice, systemQuery()?.matches ?? false);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f1722' : '#f4f7fb');
  return theme;
}

/** Applies the saved choice now, and again whenever the device switches while the choice is "system". */
export function startTheme(): void {
  applyTheme(loadChoice());
  systemQuery()?.addEventListener('change', () => {
    if (loadChoice() === 'system') applyTheme('system');
  });
}

/** Saves a new pick and shows it straight away. */
export function chooseTheme(choice: ThemeChoice): void {
  saveChoice(choice);
  applyTheme(choice);
}
