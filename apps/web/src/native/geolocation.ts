import { isNative } from './splash';

/** The part of the phone's location plugin that is used, so a test can pass a fake. */
export interface LocationPlugin {
  checkPermissions(): Promise<{ location: string }>;
  requestPermissions(): Promise<{ location: string }>;
  getCurrentPosition(options: {
    enableHighAccuracy: boolean;
    timeout: number;
    maximumAge: number;
  }): Promise<{ coords: GeolocationCoordinates; timestamp: number }>;
}

const loadPlugin = async (): Promise<LocationPlugin> => {
  if (import.meta.env.VITE_NATIVE !== 'true') throw new Error('Not the phone app.');
  const { Geolocation } = await import('@capacitor/geolocation');
  // A plain object, not the plugin itself: a promise that resolves with the plugin would call its `then`, which a
  // plugin answers with "not implemented", and nothing would ever be located.
  return {
    checkPermissions: () => Geolocation.checkPermissions(),
    requestPermissions: () => Geolocation.requestPermissions(),
    getCurrentPosition: (options) =>
      Geolocation.getCurrentPosition(options) as unknown as ReturnType<
        LocationPlugin['getCurrentPosition']
      >,
  };
};

const failure = (code: number, message: string): GeolocationPositionError => ({
  code,
  message,
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
});

/**
 * A stand-in for `navigator.geolocation` that asks the phone itself. Android's web view asks for the location
 * permission only in some cases and gives no reason when it does not; the phone's own plugin asks every time it is
 * needed and says when the phone's location is switched off.
 */
export function phoneGeolocation(load: () => Promise<LocationPlugin> = loadPlugin): Geolocation {
  return {
    getCurrentPosition: (success, error, options) => {
      void (async () => {
        try {
          const plugin = await load();
          let { location } = await plugin.checkPermissions();
          if (location !== 'granted') location = (await plugin.requestPermissions()).location;
          if (location !== 'granted') {
            error?.(failure(1, 'Location permission was refused.'));
            return;
          }
          const position = await plugin.getCurrentPosition({
            enableHighAccuracy: options?.enableHighAccuracy ?? false,
            timeout: options?.timeout ?? 20_000,
            maximumAge: options?.maximumAge ?? 0,
          });
          success(position as unknown as GeolocationPosition);
        } catch (cause) {
          const text = cause instanceof Error ? cause.message : String(cause);
          error?.(failure(/timeout/iu.test(text) ? 3 : 2, text));
        }
      })();
    },
    watchPosition: () => 0,
    clearWatch: () => undefined,
  };
}

/** In the phone app, makes every part of the app that asks the browser where the device is ask the phone instead. */
export function installPhoneGeolocation(): void {
  if (!isNative()) return;
  // Opened in an ordinary browser (a test, say), the plugin would only call the browser's own location, which this
  // would be: so it is installed only inside the phone's own shell.
  const shell = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  if (shell?.isNativePlatform?.() !== true) return;
  Object.defineProperty(navigator, 'geolocation', {
    value: phoneGeolocation(),
    configurable: true,
  });
}
