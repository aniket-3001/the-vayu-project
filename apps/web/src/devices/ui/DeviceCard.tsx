import { hourName } from '../../today/time';
import { Cpu, Droplets, Fan, Trash2, Wifi } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usAqi } from '@vayu/core';
import { levelForAqi } from '../../design/levels';
import { airStore, useHistory, useToday } from '../../air/store';
import { AirLoading } from '../../components/AirState';
import type { Pin } from '../../data/pins';
import { today } from '../../exposure/model';
import { SPOT_LABELS } from '../../exposure/spots';
import { useHousehold, useSpots } from '../../exposure/useExposure';
import { usePins } from '../../places/usePins';
import { Pill } from '../../today/ui/Chip';
import { concentration, levelVars } from '../../today/ui/format';
import {
  AUTO_LEVELS,
  DEVICE_MODES,
  autoAboveOf,
  modeOf,
  type Device,
  type DeviceMode,
} from '../devices';
import { simulateDay, statsFor } from '../sim';
import { DeviceChart } from './DeviceChart';

const MODE_LABELS: Readonly<Record<DeviceMode, string>> = { auto: 'Auto', on: 'On', off: 'Off' };

const clock = (hour: number): string => hourName(hour);

/** The outside air near a device, hour by hour so far today, ending with the reading now. */
function outsideToday(pin: Pin, nowPm25: number): readonly number[] {
  const done: number[] = [];
  for (const value of airStore().ambient(pin, today())) {
    if (value === undefined) break;
    done.push(value);
  }
  return [...done, nowPm25];
}

/**
 * One monitor and the cleaner it runs: how the air is now, whether the fan is on and why, and how the day
 * went, laid out the way air-quality apps do it (a big reading, a status line, a mode switch, a day chart,
 * the filter). All readings are made up until the device exists, and the card says so.
 */
export function DeviceCard(props: {
  readonly device: Device;
  readonly onRemove: () => void;
  readonly onChange: (patch: { mode?: DeviceMode; autoAbove?: number }) => void;
}): React.JSX.Element {
  const { device } = props;
  const { person } = useHousehold();
  const { spots } = useSpots(person);
  const { pins } = usePins();
  // The air outside a device is the air at the place it lives in, or at your first place if that is not set.
  const pin = spots[device.where]?.pin ?? pins[0];
  const reading = useToday(pin);
  const history = useHistory(pin === undefined ? [] : [pin]);
  const waiting = (text: React.ReactNode): React.JSX.Element => (
    <li className="device-card">
      <div className="dc-top">
        <span className={`dc-icon spot-${device.where}`}>
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
          onClick={props.onRemove}
        >
          <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <p className="small">{text}</p>
    </li>
  );
  if (pin === undefined)
    return waiting('Pin a place on My Air, so there is outside air to compare with.');
  if (reading?.status !== 'ready' || history === 'loading') return waiting(<AirLoading />);
  const outdoor = outsideToday(pin, reading.data.pm25);
  if (outdoor.length < 3)
    return waiting('There is not enough air data for today yet to show this monitor’s day.');
  return <DeviceDetails {...props} outdoor={outdoor} />;
}

function DeviceDetails({
  device,
  outdoor,
  onRemove,
  onChange,
}: {
  readonly device: Device;
  readonly outdoor: readonly number[];
  readonly onRemove: () => void;
  readonly onChange: (patch: { mode?: DeviceMode; autoAbove?: number }) => void;
}): React.JSX.Element {
  const mode = modeOf(device);
  const above = autoAboveOf(device);
  const hours = simulateDay(outdoor, mode, above);
  const now = hours[hours.length - 1];
  const stats = statsFor(hours);
  const inside = now?.indoor ?? 0;
  const outside = now?.outdoor ?? 0;
  const insideAqi = usAqi(inside)?.value ?? 0;
  const outsideAqi = usAqi(outside)?.value ?? 0;
  const level = levelForAqi(insideAqi);
  const fanOn = now?.fan === true;
  const where = SPOT_LABELS[device.where].toLowerCase();
  const reason =
    mode === 'on'
      ? 'Kept on by you.'
      : mode === 'off'
        ? 'Kept off by you.'
        : fanOn
          ? `On by itself: the room went above ${String(above)} µg/m³.`
          : `Waiting: it comes on above ${String(above)} µg/m³.`;
  const summary = `Today so far, PM2.5 in µg/m³. Room: ${concentration(stats.meanIndoor)} on average. Outside: ${concentration(stats.meanOutdoor)}. The cleaner ran ${String(stats.fanHours)} of ${String(hours.length)} hours.`;
  return (
    <li className="device-card" style={levelVars(level)}>
      <div className="dc-top">
        <span className={`dc-icon spot-${device.where}`}>
          <Cpu size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <h2>{device.name}</h2>
          <p className="muted small">
            <span className="dev-online">
              <Wifi size={13} strokeWidth={2.25} aria-hidden="true" /> Connected
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

      <div className="dev-now">
        <div className="dev-aqi">
          <strong className="tnum">{insideAqi}</strong>
          <span>AQI in the room</span>
          <span className="dc-level">{level.name}</span>
        </div>
        <dl className="dev-facts">
          <div>
            <dt>PM2.5 in the room</dt>
            <dd className="tnum">{concentration(inside)} µg/m³</dd>
          </div>
          <div>
            <dt>Outside</dt>
            <dd className="tnum">
              AQI {outsideAqi} · {concentration(outside)} µg/m³
            </dd>
          </div>
        </dl>
      </div>

      <div className="dev-fanrow">
        <span className={`dev-fan-state${fanOn ? ' on' : ''}`}>
          <Fan size={20} strokeWidth={1.75} aria-hidden="true" />
          <span>
            <strong>{fanOn ? 'Cleaner running' : 'Cleaner idle'}</strong>
            <span className="muted small">{reason}</span>
          </span>
        </span>
        <div className="segmented dev-modes" role="group" aria-label={`${device.name} mode`}>
          {DEVICE_MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                onChange({ mode: m });
              }}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {mode === 'auto' && (
        <label className="field dev-auto">
          <span>Switch on when the room is</span>
          <select
            value={above}
            onChange={(event) => {
              onChange({ autoAbove: Number(event.target.value) });
            }}
          >
            {AUTO_LEVELS.map((l) => (
              <option key={l.pm25} value={l.pm25}>
                {l.label}: {l.note} ({String(l.pm25)} µg/m³)
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="dev-day">
        <h3>Today so far</h3>
        <DeviceChart hours={hours} label={summary} />
        <p className="dev-key small">
          <span className="k k-in" /> Room <span className="k k-out" /> Outside{' '}
          <span className="k k-fan" /> Cleaner on
        </p>
      </div>

      <ul className="dev-stats">
        <li>
          <strong className="tnum">{String(stats.fanHours)} h</strong>
          <span>cleaner ran</span>
        </li>
        <li>
          <strong className="tnum">{String(Math.round(stats.goodShare * 100))}%</strong>
          <span>of hours with Good air in the room</span>
        </li>
        <li>
          <strong className="tnum">{String(stats.filterLeftPct)}%</strong>
          <span>filter life left</span>
        </li>
      </ul>
      {stats.firstOn !== undefined && (
        <p className="dev-effect">
          <Droplets size={16} strokeWidth={2} className="ic-drop" aria-hidden="true" />
          <span>
            The cleaner came on at {clock(stats.firstOn.hour)}. Over the next three hours the room
            went from {concentration(stats.firstOn.from)} to {concentration(stats.firstOn.to)}{' '}
            µg/m³.
          </span>
        </p>
      )}
      <p className="small dev-link">
        This monitor’s reading stands in for the outside air whenever you are in your {where}, in{' '}
        <Link to="/exposure">Exposure</Link>.
      </p>
      <p className="small dc-note">
        <Pill>Sample reading</Pill> The monitor is not built yet. These numbers are made up from the
        outside air, the filter life from the maker’s 3,000-hour claim.
      </p>
    </li>
  );
}
