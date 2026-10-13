/** True only in the build for the Android and iOS apps; the website's build replaces this with a constant `false`. */
export const isNative = (): boolean => import.meta.env.VITE_NATIVE === 'true';

/** How long the startup screen stays at least, so it never flashes by. Counted from when the page started loading. */
export const SPLASH_MIN_MS = 1200;
const FADE_MS = 300;

interface SplashPlugin {
  hide(options?: { fadeOutDuration?: number }): Promise<void>;
}

/**
 * The plugin is imported only behind the build flag, which the website's build replaces with a constant, so the website
 * ships none of it. It is wrapped in a plain object because a promise that resolves with the plugin itself would call
 * its `then`, which a plugin answers with "not implemented", and the startup screen would never come down.
 */
const loadPlugin = (): Promise<SplashPlugin> =>
  import.meta.env.VITE_NATIVE === 'true'
    ? import('@capacitor/splash-screen').then(({ SplashScreen }) => ({
        hide: (options) => SplashScreen.hide(options),
      }))
    : Promise.reject(new Error('Not the phone app.'));

/**
 * Takes down the startup screen of the phone app once the real app has been drawn. In the website nothing is loaded
 * or done. It never throws: if the plugin is missing the app is simply already showing.
 */
export async function hideSplash(
  options: {
    readonly native?: boolean;
    readonly sinceStartMs?: number;
    readonly load?: () => Promise<SplashPlugin>;
    readonly wait?: (ms: number) => Promise<void>;
  } = {},
): Promise<void> {
  const native = options.native ?? isNative();
  if (!native) return;
  const since =
    options.sinceStartMs ??
    (typeof performance === 'undefined' ? SPLASH_MIN_MS : performance.now());
  const load = options.load ?? loadPlugin;
  const wait =
    options.wait ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));
  try {
    const remaining = SPLASH_MIN_MS - since;
    if (remaining > 0) await wait(remaining);
    await (await load()).hide({ fadeOutDuration: FADE_MS });
  } catch {
    // Nothing to do: the app is already on screen.
  }
}
