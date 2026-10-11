import { usAqi } from '@vayu/core';
import { Bluetooth, BluetoothOff, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { levelForAqi } from '../../design/levels';
import { SPOT_LABELS } from '../../exposure/spots';
import { concentration, levelVars } from '../../today/ui/format';
import { useDevices } from '../useDevices';
import { useRoomComparison } from '../useRoom';
import { useUnitState } from '../useUnit';
import { LiveChart } from './LiveChart';

/** How long without a packet before the reading is called stale, in seconds. */
const STALE_S = 10;

/**
 * "Your room", at the top of My Air while a measuring unit is connected: what the room is breathing right now, live,
 * beside the air outside. It is the reading Exposure uses for the hours spent where the unit is, in place of the
 * outside reading at the address.
 */
export function YourRoomCard(): React.JSX.Element | null {
  const unit = useUnitState();
  const { devices } = useDevices();
  const device = devices.find((d) => d.id === unit.deviceId);
  const reading = unit.latest?.reading;
  const comparison = useRoomComparison(device, reading?.pm25);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  if ((unit.status !== 'connected' && unit.status !== 'lost') || reading === undefined) return null;

  const aqi = usAqi(reading.pm25)?.value ?? 0;
  const level = levelForAqi(aqi);
  const live = unit.status === 'connected';
  const ageS = Math.max(0, Math.round((nowMs - (unit.latest?.atMs ?? nowMs)) / 1000));
  const stale = ageS > STALE_S;
  const where = device === undefined ? 'home' : SPOT_LABELS[device.where].toLowerCase();
  const { outside, pin, lower } = comparison;
  const p = outside?.provenance;

  return (
    <section className="card room-card" style={levelVars(level)} aria-labelledby="room-title">
      <div className="card-head">
        <div>
          <h2 id="room-title">Your room</h2>
          <p className="muted small">
            <span className={`dev-online${live ? '' : ' off'}`}>
              {live ? (
                <Bluetooth size={13} strokeWidth={2.25} aria-hidden="true" />
              ) : (
                <BluetoothOff size={13} strokeWidth={2.25} aria-hidden="true" />
              )}{' '}
              {live ? 'Connected' : 'Connection lost'}
            </span>{' '}
            · {unit.name ?? 'Your unit'}, in your {where}
          </p>
        </div>
        <Link to="/?tab=devices" className="room-more">
          Device <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <div className="room-now">
        <div className="room-aqi">
          <strong className="tnum">{aqi}</strong>
          <span>AQI in the room</span>
          <span className="room-level">{level.name}</span>
        </div>
        <dl className="room-facts">
          <div>
            <dt>PM2.5</dt>
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

      <LiveChart points={unit.recent} height={170} />

      <p className="small muted" role="status">
        {reading.warming
          ? 'The sensor is warming up. This number is shown but not counted yet.'
          : !live || stale
            ? `No reading for ${String(ageS)} seconds. The unit may be out of range.`
            : `Updated ${String(ageS)} second${ageS === 1 ? '' : 's'} ago.`}
      </p>

      {outside !== undefined ? (
        <p className="unit-compare">
          <strong>Outside</strong> at {pin?.name ?? 'your place'}: AQI {outside.aqi} ·{' '}
          {concentration(outside.pm25)} µg/m³
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
      ) : (
        <p className="small unit-compare">
          {comparison.status === 'none'
            ? 'Add a place below to see this beside the air outside.'
            : comparison.status === 'error'
              ? 'The air outside could not be loaded just now.'
              : 'Getting the air outside…'}
        </p>
      )}

      <p className="small muted">
        <Link to="/exposure">Exposure</Link> counts the hours you spend in your {where} from this
        reading, not from the outside air at the address.
      </p>
    </section>
  );
}
