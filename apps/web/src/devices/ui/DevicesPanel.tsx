import { Cpu, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { levelForAqi } from '../../design/levels';
import { SPOT_KINDS, SPOT_LABELS, sampleSpotsFor, type SpotKind } from '../../exposure/spots';
import { readingForPin } from '../../places/placeSample';
import { usAqi } from '@vayu/core';
import { Pill } from '../../today/ui/Chip';
import { concentration, levelVars } from '../../today/ui/format';
import { sampleIndoorPm25, type Device } from '../devices';
import { useDevices } from '../useDevices';

/** The outdoor PM2.5 near where a device sits: the pinned place for that kind, or a Delhi default. */
function outdoorPm25(where: SpotKind): number {
  const pin = (sampleSpotsFor('adult')[where] ?? sampleSpotsFor('child')[where])?.pin;
  return pin === undefined ? 70 : readingForPin(pin).pm25;
}

function DeviceCard({
  device,
  onRemove,
}: {
  readonly device: Device;
  readonly onRemove: () => void;
}): React.JSX.Element {
  const outside = outdoorPm25(device.where);
  const inside = sampleIndoorPm25(outside);
  const level = levelForAqi(usAqi(inside)?.value ?? 0);
  return (
    <li className="device-card" style={levelVars(level)}>
      <div className="dc-top">
        <span className="dc-icon">
          <Cpu size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <h2>{device.name}</h2>
          <p className="muted small">In your {SPOT_LABELS[device.where].toLowerCase()}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={`Remove ${device.name}`}
          onClick={onRemove}
        >
          <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <dl className="dc-readings">
        <div>
          <dt>Indoors</dt>
          <dd>
            <strong className="tnum">{concentration(inside)}</strong> µg/m³ PM<sub>2.5</sub>
          </dd>
          <dd className="dc-level">{level.name}</dd>
        </div>
        <div>
          <dt>Outside</dt>
          <dd>
            <strong className="tnum">{concentration(outside)}</strong> µg/m³ PM<sub>2.5</sub>
          </dd>
        </div>
      </dl>
      <p className="small dc-note">
        <Pill>Sample reading</Pill> The monitor is not built yet, so this is made up from the
        outside air.
      </p>
    </li>
  );
}

/** Your monitors, and a way to add one and say where it lives. */
export function DevicesPanel(): React.JSX.Element {
  const { devices, add, remove } = useDevices();
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
