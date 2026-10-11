import { Bluetooth, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SPOT_KINDS, SPOT_LABELS, type SpotKind } from '../../exposure/spots';
import { ToBeImplemented } from '../../components/ToBeImplemented';
import type { UnitTransport } from '../ble';
import { defaultTransport } from '../transport';
import { useDevices } from '../useDevices';
import { useUnit } from '../useUnit';

/**
 * Add a device, from the button on My Air: a real measuring unit over Bluetooth, which becomes the "Your room" card, or
 * (until the cleaner is built) a sample cleaner that only shows what its card will do.
 */
export function AddDeviceSheet({
  onClose,
  transport = defaultTransport,
}: {
  readonly onClose: () => void;
  readonly transport?: UnitTransport;
}): React.JSX.Element {
  const { addMeasured, add } = useDevices();
  const unit = useUnit({ transport });
  const [where, setWhere] = useState<SpotKind>('home');
  const [sample, setSample] = useState(false);
  // Once the unit is found and sending, there is nothing more to do here: the room card is on My Air.
  const was = useRef(unit.state.status);
  useEffect(() => {
    if (unit.state.status === 'connected' && was.current !== 'connected') onClose();
    was.current = unit.state.status;
  }, [unit.state.status, onClose]);

  const places = SPOT_KINDS.filter((kind) => kind !== 'outdoor');
  return (
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Add a device">
        <div className="sheet-head">
          <h2>Add a device</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <section className="unit-connect" aria-label="Connect a measuring unit">
          <h3>
            <Bluetooth size={16} strokeWidth={2} aria-hidden="true" /> Vayu measuring unit
          </h3>
          <p className="muted small">
            An ESP32 board with a particle sensor. Switch it on, say where it is, and connect over
            Bluetooth. It becomes the first card on My Air, and its readings count in Exposure for
            the hours you spend there.
          </p>
          <fieldset className="field">
            <legend>Where is it?</legend>
            <div className="choice-row">
              {places.map((kind) => (
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
              This browser cannot connect to a unit over Bluetooth. Use Chrome on an Android phone
              or on a computer; Safari on an iPhone does not allow it.
            </p>
          )}
          {unit.state.problem !== undefined && (
            <p className="small unit-problem" role="status">
              {unit.state.problem}
            </p>
          )}
        </section>

        <section aria-label="Air cleaner">
          <h3>Air cleaner</h3>
          <ToBeImplemented>
            The cleaner and its automatic switching are not built. A sample one shows what its card
            will do, with made-up readings that never count in your Exposure.
          </ToBeImplemented>
          {sample ? (
            <div className="form-actions">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  add({ name: '', where });
                  onClose();
                }}
              >
                Add a sample cleaner in your {SPOT_LABELS[where].toLowerCase()}
              </button>
              <button
                type="button"
                className="plain"
                onClick={() => {
                  setSample(false);
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="dashed"
              onClick={() => {
                setSample(true);
              }}
            >
              Add a sample cleaner
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
