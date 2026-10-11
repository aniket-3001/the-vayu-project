import { gpsOn } from './gps';

export type Locate = (onFound: (lat: number, lng: number) => void, onFail: () => void) => void;

/** Asks the browser where the device is, once. Only called when the person taps something that needs it. */
export const browserLocate: Locate = (onFound, onFail) => {
  // With the app's GPS switch off, nothing asks the device where it is.
  if (!gpsOn() || !('geolocation' in navigator)) {
    onFail();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      onFound(position.coords.latitude, position.coords.longitude);
    },
    onFail,
    { timeout: 10_000 },
  );
};
