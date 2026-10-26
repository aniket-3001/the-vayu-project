import { track } from '../analytics';
import { gpsOn } from './gps';

export type Locate = (onFound: (lat: number, lng: number) => void, onFail: () => void) => void;

/** A fix this recent is as good as a new one for choosing a place, and is found at once. */
const RECENT_MS = 5 * 60_000;
/** The phone's first look can take a while indoors, so it is given time before the person is told it failed. */
const FIRST_LOOK_MS = 15_000;
const SECOND_LOOK_MS = 20_000;
/** The browser's code for a refused permission: asking again would only ask the person again. */
const PERMISSION_DENIED = 1;

/**
 * Asks the browser where the device is, once. Only called when the person taps something that needs it. A coarse look
 * comes first, which is quick and spares the battery; if it cannot find the device, one more look with the precise
 * sensor follows, before the person is told it did not work.
 */
export const browserLocate: Locate = (onFound, onFail) => {
  // With the app's GPS switch off, nothing asks the device where it is.
  if (!gpsOn() || !('geolocation' in navigator)) {
    onFail();
    return;
  }
  const found = (position: GeolocationPosition): void => {
    track('permission', 'location:granted');
    onFound(position.coords.latitude, position.coords.longitude);
  };
  navigator.geolocation.getCurrentPosition(
    found,
    (error) => {
      if (error.code === PERMISSION_DENIED) {
        track('permission', 'location:denied');
        onFail();
        return;
      }
      navigator.geolocation.getCurrentPosition(found, onFail, {
        enableHighAccuracy: true,
        maximumAge: RECENT_MS,
        timeout: SECOND_LOOK_MS,
      });
    },
    { enableHighAccuracy: false, maximumAge: RECENT_MS, timeout: FIRST_LOOK_MS },
  );
};
