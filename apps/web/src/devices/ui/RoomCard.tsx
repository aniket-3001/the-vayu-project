import { Bluetooth, BluetoothOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SPOT_LABELS } from '../../exposure/spots';
import { FaceIcon } from '../../today/ui/icons';
import { AirFigures } from '../../units/AirUnits';
import { useRoom } from '../useRoom';
import { LiveChart } from './LiveChart';

/** "2 s ago", "1 min ago". */
const ago = (seconds: number): string =>
  seconds < 60 ? `${String(seconds)} s ago` : `${String(Math.round(seconds / 60))} min ago`;

/**
 * "Your room": the first card on My Air while a measuring unit is saved. The same card as a place, in the colour of the
 * room's air, but its lower half is the live line of the last minutes in place of the forecast. Pressing it opens the
 * room, where the line is set beside the air outside.
 */
export function RoomCard(): React.JSX.Element | null {
  const room = useRoom();
  // Seconds tick, so "updated 3 s ago" stays true.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const { device, reading, level, aqi, live, atMs } = room;
  if (device === undefined) return null;
  const where = SPOT_LABELS[device.where].toLowerCase();
  const ageS = atMs === undefined ? 0 : Math.max(0, Math.round((nowMs - atMs) / 1000));
  const { lower } = room.comparison;

  if (reading === undefined || aqi === undefined || level === undefined) {
    return (
      <li className="place-card pending room-pc">
        <Link to="/room" className="pc-hit" aria-label="Open your room" draggable={false}>
          <span className="pc-name">Your room</span>
          <span className="pc-detail">
            {device.name} · in your {where}
          </span>
          <span className="pc-level">
            <BluetoothOff size={14} aria-hidden="true" /> Not connected
          </span>
          <span className="muted small">Open to connect and see the live air.</span>
        </Link>
      </li>
    );
  }
  return (
    <li
      className="place-card room-pc"
      style={{ '--level': level.solid, '--on-level': level.onSolid } as React.CSSProperties}
    >
      <Link to="/room" className="pc-hit" aria-label="Open your room" draggable={false}>
        <span className="pc-name">Your room</span>
        <span className="pc-detail">
          {device.name} · in your {where}
        </span>
        <span className="live-tags">
          <span className="live-pill">
            <i className="live-dot" aria-hidden="true" />
            {live ? 'LIVE' : 'LOST'}
          </span>
        </span>
        <AirFigures aqi={aqi} pm25={reading.pm25} layout="auto" />
        <span className="pc-line">
          <span className="pc-level">{level.name}</span>
        </span>
        <span className="pc-face" aria-hidden="true">
          <FaceIcon face={level.face} size={60} />
        </span>
      </Link>
      <div className="pc-more">
        <div className="pc-live" aria-hidden={room.recent.length < 2 ? 'true' : undefined}>
          <LiveChart points={room.recent} height={120} compact stretch maxSpanMs={5 * 60_000} />
        </div>
        <p className="pc-source">
          {live ? (
            <Bluetooth size={12} aria-hidden="true" />
          ) : (
            <BluetoothOff size={12} aria-hidden="true" />
          )}{' '}
          {live ? 'Connected' : 'Connection lost'} · {ago(ageS)}
          {lower === undefined
            ? ''
            : ` · ${String(Math.abs(lower))}% ${lower >= 0 ? 'lower' : 'higher'} than outside`}
        </p>
      </div>
    </li>
  );
}
