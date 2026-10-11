import { usAqi } from '@vayu/core';
import { Bluetooth, BluetoothOff, Cpu, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { airStore, useToday } from '../../air/store';
import { levelForAqi } from '../../design/levels';
import { today } from '../../exposure/model';
import { SPOT_LABELS } from '../../exposure/spots';
import { useHousehold, useSpots } from '../../exposure/useExposure';
import { usePins } from '../../places/usePins';
import { Pill } from '../../today/ui/Chip';
import { concentration, levelVars } from '../../today/ui/format';
import type { Device } from '../devices';
import { measuredHourly } from '../measured';
import type { DeviceHour } from '../sim';
import type { UnitState } from '../useUnit';
import { DeviceChart } from './DeviceChart';
import { LiveChart } from './LiveChart';

/** How long without a packet before the reading is called stale, in seconds. */
const STALE_S = 10;

/**
 * A real measuring unit, connected over Bluetooth. Its reading is measured, not worked out: this card says what the
 * room is breathing now, how that compares with the air outside at the place it is in, and how the day has gone from the
 * hours it has measured. Hours spent there count in Exposure as measured by the person's own unit.
 */
export function MeasuredCard({
  device,
  unit,
  nowMs,
  onConnect,
  onDisconnect,
  onRemove,
}: {
  readonly device: Device;
  /** The state of the live link, when this device is the one connected. */
  readonly unit: UnitState;
  readonly nowMs: number;
  readonly onConnect: () => void;
  readonly onDisconnect: () => void;
  readonly onRemove: () => void;
}): React.JSX.Element {
  const { person } = useHousehold();
  const { spots } = useSpots(person);
  const { pins } = usePins();
  const pin = spots[device.where]?.pin ?? pins[0];
  const outside = useToday(pin);
  const mine = unit.deviceId === device.id;
  const latest = mine ? unit.latest : undefined;
  const live = mine && unit.status === 'connected';
  const ageS =
    latest === undefined ? undefined : Math.max(0, Math.round((nowMs - latest.atMs) / 1000));
  const stale = ageS !== undefined && ageS > STALE_S;
  const reading = latest?.reading;
  const roomPm = reading?.pm25;
  const roomAqi = roomPm === undefined ? undefined : (usAqi(roomPm)?.value ?? 0);
  const level = roomAqi === undefined ? undefined : levelForAqi(roomAqi);
  const out = outside?.status === 'ready' ? outside.data : undefined;
  const where = SPOT_LABELS[device.where].toLowerCase();

  // The day so far from the hours it has measured, beside the outside air for the same hours.
  const measured = measuredHourly(window.localStorage, device.id, today());
  const open = pin === undefined ? [] : airStore().ambient(pin, today());
  const hours: DeviceHour[] = [];
  measured.forEach((indoor, hour) => {
    const outdoor = open[hour];
    if (indoor !== undefined && outdoor !== undefined)
      hours.push({ hour, outdoor, indoor, fan: false });
  });
  const lower =
    roomPm !== undefined && out !== undefined && out.pm25 > 0
      ? Math.round((1 - roomPm / out.pm25) * 100)
      : undefined;
  const p = out?.provenance;

  return (
    <li
      className="device-card unit-card"
      style={level === undefined ? undefined : levelVars(level)}
    >
      <div className="dc-top">
        <span className={`dc-icon spot-${device.where}`}>
          <Cpu size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <h2>{device.name}</h2>
          <p className="muted small">
            <span className={`dev-online${live ? '' : ' off'}`}>
              {live ? (
                <Bluetooth size={13} strokeWidth={2.25} aria-hidden="true" />
              ) : (
                <BluetoothOff size={13} strokeWidth={2.25} aria-hidden="true" />
              )}{' '}
              {live ? 'Connected' : 'Not connected'}
            </span>{' '}
            · In your {where}
          </p>
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

      {reading !== undefined && roomAqi !== undefined && level !== undefined ? (
        <>
          <div className="dev-now">
            <div className="dev-aqi">
              <strong className="tnum">{roomAqi}</strong>
              <span>AQI in the room</span>
              <span className="dc-level">{level.name}</span>
            </div>
            <dl className="dev-facts">
              <div>
                <dt>PM2.5 in the room</dt>
                <dd className="tnum">{concentration(reading.pm25)} µg/m³</dd>
              </div>
              <div>
                <dt>PM1 · PM10</dt>
                <dd className="tnum">
                  {concentration(reading.pm1)} · {concentration(reading.pm10)} µg/m³
                </dd>
              </div>
              {reading.temperatureC !== undefined && reading.humidityPct !== undefined && (
                <div>
                  <dt>Room</dt>
                  <dd className="tnum">
                    {reading.temperatureC.toFixed(1)}°C · {Math.round(reading.humidityPct)}%
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <LiveChart points={unit.recent} />
          <p className="small unit-age" role="status">
            {reading.warming
              ? 'The sensor is warming up. This number is shown but not counted yet.'
              : stale
                ? `No reading for ${String(ageS)} seconds. The unit may be out of range.`
                : `Updated ${String(ageS)} second${ageS === 1 ? '' : 's'} ago.`}
          </p>
        </>
      ) : (
        <p className="small unit-wait">
          {mine && unit.status === 'connecting'
            ? 'Connecting to the unit…'
            : 'Connect over Bluetooth to see what this room is breathing now.'}
        </p>
      )}

      {out === undefined && (
        <p className="small unit-compare">
          {pin === undefined
            ? 'Add a place on the Places tab to see this reading beside the air outside.'
            : outside?.status === 'error'
              ? 'The air outside could not be loaded just now.'
              : 'Getting the air outside…'}
        </p>
      )}
      {out !== undefined && (
        <p className="unit-compare">
          <strong>Outside</strong> at {pin?.name ?? 'your place'}: AQI {out.aqi} ·{' '}
          {concentration(out.pm25)} µg/m³
          {p?.stationName !== undefined && p.distanceKm !== undefined
            ? `, from ${p.stationName}, ${String(Math.round(p.distanceKm * 10) / 10)} km away`
            : ' (regional model)'}
          .
          {lower !== undefined && (
            <>
              {' '}
              The room is{' '}
              <strong>
                {lower >= 0 ? `${String(lower)}% lower` : `${String(-lower)}% higher`}
              </strong>{' '}
              than outside.
            </>
          )}
        </p>
      )}

      {hours.length >= 2 && (
        <div className="dev-day">
          <h3>Today so far, measured</h3>
          <DeviceChart
            hours={hours}
            label={`Today so far, PM2.5 in µg/m³, hour by hour: the room as measured and outside. ${String(hours.length)} hours.`}
          />
          <p className="dev-key small">
            <span className="k k-in" /> Room, measured <span className="k k-out" /> Outside
          </p>
        </div>
      )}

      <div className="form-actions">
        {live ? (
          <button type="button" className="plain" onClick={onDisconnect}>
            Disconnect
          </button>
        ) : (
          <button type="button" className="primary" onClick={onConnect}>
            Connect over Bluetooth
          </button>
        )}
      </div>

      <p className="small dev-link">
        Hours you spend in your {where} are counted in <Link to="/exposure">Exposure</Link> from
        this unit’s reading, once it has measured at least a couple of minutes of the hour.
      </p>
      {mine && unit.simulated === true ? (
        <p className="small dc-note">
          <Pill>Simulated</Pill> A made-up unit, to try this screen with no hardware. Nothing here
          is measured, kept or counted.
        </p>
      ) : (
        <p className="small dc-note">
          <Pill>Measured</Pill> By your own unit. A low-cost particle sensor: its readings are shown
          next to the nearest monitor’s so you can see how they compare, and are not an official
          measurement.
        </p>
      )}
    </li>
  );
}
