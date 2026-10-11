import { Bluetooth, Cpu, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SPOT_KINDS, SPOT_LABELS, type SpotKind } from '../../exposure/spots';
import { ToBeImplemented } from '../../components/ToBeImplemented';
import { DeviceCard } from './DeviceCard';
import { useDevices } from '../useDevices';
import { webBluetooth, type UnitTransport } from '../ble';
import { simulatedUnit } from '../simulatedUnit';
import { useUnit } from '../useUnit';
import { MeasuredCard } from './MeasuredCard';

/** Your monitors, and a way to add one and say where it lives. */
export function DevicesPanel({
  transport = import.meta.env.VITE_DEMO === '1' ? simulatedUnit : webBluetooth,
}: {
  /** How to reach a unit: Bluetooth in the app; the prototype has a made-up one so it can be tried with no hardware. */
  readonly transport?: UnitTransport;
}): React.JSX.Element {
  const { devices, add, addMeasured, remove, update } = useDevices();
  const unit = useUnit({ transport });
  // Seconds tick, so "updated 3 seconds ago" stays true.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [where, setWhere] = useState<SpotKind>('home');

  return (
    <div className="panel">
      <section className="promo" aria-label="About the Vayu monitor">
        <div>
          <h2>Vayu monitor</h2>
          <p>
            Reads the air indoors and next to you, so your exposure uses what you actually breathe.
          </p>
          <p className="muted small">In development. Not for sale yet.</p>
        </div>
        <span className="promo-art" aria-hidden="true">
          <Cpu size={44} strokeWidth={1.25} />
        </span>
      </section>

      <section className="unit-connect" aria-label="Connect a measuring unit">
        <h2>
          <Bluetooth size={18} strokeWidth={2} aria-hidden="true" /> Connect a measuring unit
        </h2>
        <p className="muted small">
          A Vayu measuring unit is an ESP32 board with a particle sensor. Switch it on, choose where
          it is, and connect over Bluetooth: its readings are real, are kept, and count in Exposure
          for the hours you spend there.
        </p>
        <fieldset className="field">
          <legend>Where is it?</legend>
          <div className="choice-row">
            {SPOT_KINDS.filter((kind) => kind !== 'outdoor').map((kind) => (
              <button
                key={kind}
                type="button"
                className="choice"
                aria-pressed={where === kind}
                onClick={() => {
                  setWhere(kind);
                }}
              >
                {SPOT_LABELS[kind]}
              </button>
            ))}
          </div>
        </fieldset>
        {unit.supported ? (
          <button
            type="button"
            className="primary"
            disabled={unit.state.status === 'connecting'}
            onClick={() => {
              void unit.connect((bleName) => addMeasured({ bleName, where }));
            }}
          >
            <Bluetooth size={16} aria-hidden="true" />{' '}
            {unit.state.status === 'connecting' ? 'Connecting…' : 'Connect over Bluetooth'}
          </button>
        ) : (
          <p className="small" role="status">
            This browser cannot connect to a unit over Bluetooth. Use Chrome on an Android phone or
            on a computer; Safari on an iPhone does not allow it.
          </p>
        )}
        {unit.state.problem !== undefined && (
          <p className="small unit-problem" role="status">
            {unit.state.problem}
          </p>
        )}
      </section>

      <ToBeImplemented>
        The cleaner and its automatic switching are not built, so a device added by hand below shows
        made-up readings worked out from the outside air, only to show what this page will do; they
        never count in your Exposure. A unit connected over Bluetooth above is measured.
      </ToBeImplemented>

      {devices.length > 0 && (
        <ul className="device-list" aria-label="Your devices">
          {devices.map((device) =>
            device.measured === true ? (
              <MeasuredCard
                key={device.id}
                device={device}
                unit={unit.state}
                nowMs={nowMs}
                onConnect={() => {
                  void unit.connect((bleName) => addMeasured({ bleName, where: device.where }));
                }}
                onDisconnect={unit.disconnect}
                onRemove={() => {
                  if (unit.state.deviceId === device.id) unit.disconnect();
                  remove(device.id);
                }}
              />
            ) : (
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
            ),
          )}
        </ul>
      )}

      {adding ? (
        <form
          className="add-device"
          onSubmit={(event) => {
            event.preventDefault();
            add({ name, where });
            setAdding(false);
            setName('');
          }}
        >
          <h2>Add a sample device</h2>
          <label className="field">
            <span>Name</span>
            <input
              value={name}
              placeholder="Vayu monitor"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
          <fieldset className="field">
            <legend>Where will it be?</legend>
            <div className="choice-row">
              {SPOT_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="choice"
                  aria-pressed={where === kind}
                  onClick={() => {
                    setWhere(kind);
                  }}
                >
                  {SPOT_LABELS[kind]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="form-actions">
            <button type="submit" className="primary">
              Add device
            </button>
            <button
              type="button"
              className="plain"
              onClick={() => {
                setAdding(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="dashed"
          onClick={() => {
            setAdding(true);
          }}
        >
          <span className="dashed-icon">
            <Plus size={20} strokeWidth={2} aria-hidden="true" />
          </span>
          {devices.length === 0 ? 'Add a sample device' : 'Add another sample device'}
        </button>
      )}
    </div>
  );
}
