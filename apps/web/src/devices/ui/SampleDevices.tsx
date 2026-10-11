import { ToBeImplemented } from '../../components/ToBeImplemented';
import { useDevices } from '../useDevices';
import { DeviceCard } from './DeviceCard';

/** The sample cleaners the person added, below the places: made-up readings, said so, and never counted. */
export function SampleDevices(): React.JSX.Element | null {
  const { devices, remove, update } = useDevices();
  const samples = devices.filter((d) => d.measured !== true);
  if (samples.length === 0) return null;
  return (
    <section className="sample-devices" aria-label="Sample devices">
      <ToBeImplemented>
        The cleaner and its automatic switching are not built, so a device added by hand shows
        made-up readings worked out from the outside air, only to show what this page will do; they
        never count in your Exposure.
      </ToBeImplemented>
      <ul className="device-list" aria-label="Your devices">
        {samples.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            onRemove={() => {
              remove(device.id);
            }}
            onChange={(patch) => {
              update(device.id, patch);
            }}
          />
        ))}
      </ul>
    </section>
  );
}
