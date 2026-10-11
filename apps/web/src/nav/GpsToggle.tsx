import { Navigation, NavigationOff } from 'lucide-react';
import { liveLocation } from '../places/liveLocation';
import { useGps } from '../places/gps';

/**
 * The app's GPS switch: on, the app may ask where the device is (for “Detect my location” and the automatic
 * exposure); off, it never does, and following the device stops. It is not Detect my location, which is one use of it.
 */
export function GpsToggle(): React.JSX.Element {
  const gps = useGps();
  return (
    <button
      type="button"
      className={`smoke-toggle gps-toggle${gps.on ? ' on' : ' off'}`}
      aria-pressed={gps.on}
      aria-label="GPS"
      title={gps.on ? 'GPS is on. Press to turn it off.' : 'GPS is off. Press to turn it on.'}
      onClick={() => {
        if (gps.on) liveLocation().set(false);
        gps.set(!gps.on);
      }}
    >
      {gps.on ? (
        <Navigation size={22} strokeWidth={2} aria-hidden="true" />
      ) : (
        <NavigationOff size={22} strokeWidth={2} aria-hidden="true" />
      )}
    </button>
  );
}
