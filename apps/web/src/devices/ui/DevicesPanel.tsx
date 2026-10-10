import { Cpu, Plus } from 'lucide-react';
import { useState } from 'react';
import { SPOT_KINDS, SPOT_LABELS, type SpotKind } from '../../exposure/spots';
import { DeviceCard } from './DeviceCard';
import { useDevices } from '../useDevices';

/** Your monitors, and a way to add one and say where it lives. */
export function DevicesPanel(): React.JSX.Element {
  const { devices, add, remove, update } = useDevices();
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

      {devices.length > 0 && (
        <ul className="device-list" aria-label="Your devices">
          {devices.map((device) => (
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
          <h2>Add a device</h2>
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
          {devices.length === 0 ? 'Add first device' : 'Add another device'}
        </button>
      )}
    </div>
  );
}
