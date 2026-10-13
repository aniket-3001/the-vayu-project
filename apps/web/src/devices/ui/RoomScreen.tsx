import { usAqi } from '@vayu/core';
import { Bluetooth, ChevronLeft, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LEVELS, levelForAqi } from '../../design/levels';
import { today } from '../../exposure/model';
import { SPOT_LABELS } from '../../exposure/spots';
import { concentration, levelVars } from '../../today/ui/format';
import { type UnitTransport, measuredHourly } from '@vayu/unit';
import { roomAdvice } from '../roomAdvice';
import { defaultTransport } from '../transport';
import { useDevices } from '../useDevices';
import { useRoom } from '../useRoom';
import { useUnit } from '../useUnit';
import { LiveChart, windowMs, type LiveMark } from './LiveChart';

const aqiOf = (pm25: number): number => usAqi(pm25)?.value ?? 0;
const STALE_S = 10;
const TEST_LABELS = ['Purifier on', 'Window opened'] as const;

/** A moment the person marked, and the PM2.5 at that moment. */
interface Marked {
  readonly atMs: number;
  readonly label: string;
  readonly pm25: number;
}

/**
 * The room, opened out on one screen: the live line of the room against the air outside (80%) beside the room's
 * numbers (20%), then the room's day (half) beside a few plain insights (half). The buttons to reconnect or remove the
 * unit are at the top right. On a phone the four parts stack.
 */
export function RoomScreen({
  transport = defaultTransport,
}: {
  readonly transport?: UnitTransport;
}): React.JSX.Element {
  const room = useRoom();
  const unit = useUnit({ transport });
  const { remove } = useDevices();
  const navigate = useNavigate();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [mark, setMark] = useState<Marked | undefined>(undefined);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const { device, reading, aqi, level, live, comparison, recent } = room;
  const back = (
    <Link to="/" className="back">
      <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" /> My Air
    </Link>
  );
  if (device === undefined) {
    return (
      <div className="page">
        <header className="place">{back}</header>
        <main className="layout">
          <p className="empty">
            No measuring unit is added yet. Use <strong>Add device</strong> on My Air.
          </p>
        </main>
      </div>
    );
  }
  const where = SPOT_LABELS[device.where].toLowerCase();
  const { outside, pin, lower } = comparison;
  const outsideAqi = outside?.aqi;
  const ageS =
    room.atMs === undefined ? undefined : Math.max(0, Math.round((nowMs - room.atMs) / 1000));
  const p = outside?.provenance;
  const span = windowMs(recent, 10 * 60_000);
  const inWindow = recent.filter((r) => r.atMs >= (recent.at(-1)?.atMs ?? 0) - span);
  const aqis = inWindow.map((r) => aqiOf(r.pm25));
  const cleaner =
    outsideAqi === undefined || aqis.length === 0
      ? undefined
      : Math.round((aqis.filter((a) => a < outsideAqi).length / aqis.length) * 100);
  const mean =
    aqis.length === 0 ? undefined : Math.round(aqis.reduce((a, b) => a + b, 0) / aqis.length);
  const advice = aqi === undefined ? undefined : roomAdvice(aqi, outsideAqi);

  // The test: from the moment marked to now, how far the room's PM2.5 moved, and how long it took to halve.
  const marks: readonly LiveMark[] =
    mark === undefined ? [] : [{ atMs: mark.atMs, label: mark.label }];
  const since = mark === undefined ? [] : recent.filter((r) => r.atMs >= mark.atMs);
  const nowPm = recent.at(-1)?.pm25;
  const change =
    mark === undefined || nowPm === undefined || mark.pm25 <= 0
      ? undefined
      : Math.round((1 - nowPm / mark.pm25) * 100);
  const half = mark === undefined ? undefined : since.find((r) => r.pm25 <= mark.pm25 / 2)?.atMs;

  // The room's day from the hours it has measured.
  const measured = measuredHourly(window.localStorage, device.id, today());
  const hoursMeasured = measured.filter((m) => m !== undefined).length;
  const stale = ageS !== undefined && ageS > STALE_S;

  return (
    <div className="page room-page" style={level === undefined ? undefined : levelVars(level)}>
      <header className="place room-head">
        <div>
          {back}
          <h1>
            Your room{' '}
            <span className="room-meta">
              {device.name} · in your {where} ·{' '}
              {live
                ? 'Connected'
                : unit.state.status === 'connecting'
                  ? 'Connecting…'
                  : 'Not connected'}
            </span>
          </h1>
        </div>
        <div className="room-actions">
          {unit.supported && (
            <button
              type="button"
              className="room-action"
              disabled={unit.state.status === 'connecting'}
              onClick={() => {
                void unit.connect(() => device.id);
              }}
            >
              <Bluetooth size={16} aria-hidden="true" />{' '}
              {unit.state.status === 'connecting' ? 'Connecting…' : 'Reconnect device'}
            </button>
          )}
          <button
            type="button"
            className="room-action"
            onClick={() => {
              if (unit.state.deviceId === device.id) unit.disconnect();
              remove(device.id);
              navigate('/');
            }}
          >
            <Trash2 size={16} aria-hidden="true" /> Remove device
          </button>
        </div>
      </header>

      {reading === undefined || aqi === undefined || level === undefined ? (
        <main className="room-grid">
          <section className="card room-wait">
            <h2>Connect to see the live air</h2>
            <p className="muted">
              {unit.supported
                ? `Switch the unit on and press Reconnect device. Chrome will ask which unit; pick ${device.name}.`
                : 'This browser cannot connect over Bluetooth. Use Chrome on an Android phone or a computer.'}
            </p>
            {unit.state.problem !== undefined && (
              <p className="small unit-problem" role="status">
                {unit.state.problem}
              </p>
            )}
          </section>
        </main>
      ) : (
        <main className="room-grid">
          <section className="card room-chart" aria-labelledby="room-vs-title">
            <div className="room-chart-head">
              <h2 id="room-vs-title">The room against outside, live</h2>
              <div className="choice-row">
                {TEST_LABELS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="choice"
                    aria-pressed={mark?.label === label}
                    title="Mark this moment on the line, and see how far the air moves after it"
                    onClick={() => {
                      setMark(
                        mark?.label === label
                          ? undefined
                          : { atMs: room.atMs ?? Date.now(), label, pm25: reading.pm25 },
                      );
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="room-chart-body">
              <LiveChart
                points={recent}
                height={230}
                stretch
                {...(outside === undefined ? {} : { outsidePm25: outside.pm25 })}
                marks={marks}
              />
            </div>
            <p className="room-key small">
              <span className="k k-room" /> Room, from your unit{' '}
              {outside !== undefined ? (
                <>
                  <span className="k k-outside" /> Outside at {pin?.name ?? 'your place'}
                  {p?.stationName !== undefined && p.distanceKm !== undefined
                    ? `, ${p.stationName}, ${String(Math.round(p.distanceKm * 10) / 10)} km away`
                    : ' (regional model)'}
                </>
              ) : (
                <span className="muted">
                  {comparison.status === 'none'
                    ? 'Add a place on My Air to see the air outside as a second line.'
                    : comparison.status === 'error'
                      ? 'The air outside could not be loaded just now.'
                      : 'Getting the air outside…'}
                </span>
              )}
            </p>
            {mark !== undefined && change !== undefined && nowPm !== undefined && (
              <p className="room-test small" role="status">
                <strong>{mark.label}</strong>,{' '}
                {String(Math.max(0, Math.round((nowMs - mark.atMs) / 60_000)))} min ago: PM2.5{' '}
                {concentration(mark.pm25)} → {concentration(nowPm)} µg/m³,{' '}
                <strong>
                  {change >= 0 ? `${String(change)}% lower` : `${String(-change)}% higher`}
                </strong>
                .
                {half !== undefined
                  ? ` It halved in ${String(Math.max(1, Math.round((half - mark.atMs) / 60_000)))} min.`
                  : ''}
              </p>
            )}
          </section>

          <aside className="card room-numbers" aria-label="The room now">
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
                <dt>PM1</dt>
                <dd className="tnum">{concentration(reading.pm1)} µg/m³</dd>
              </div>
              <div>
                <dt>PM10</dt>
                <dd className="tnum">{concentration(reading.pm10)} µg/m³</dd>
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
            <p className="small muted" role="status">
              {reading.warming
                ? 'Warming up: shown, not counted yet.'
                : !live || stale
                  ? `No reading for ${String(ageS ?? 0)} s. The unit may be out of range.`
                  : `Updated ${String(ageS ?? 0)} s ago.`}
            </p>
          </aside>

          <section className="card room-day" aria-labelledby="day-title">
            <h2 id="day-title">Your room today</h2>
            <div
              className="room-hours"
              role="img"
              aria-label={`Each hour of today, coloured by the room's measured air. ${String(hoursMeasured)} hours measured.`}
            >
              {measured.map((m, hour) => {
                const a = m === undefined ? undefined : aqiOf(m);
                return (
                  <span
                    key={hour}
                    className={`room-hour${a === undefined ? ' none' : ''}`}
                    style={a === undefined ? undefined : { background: levelForAqi(a).solid }}
                    title={
                      a === undefined
                        ? `${String(hour)}:00 not measured`
                        : `${String(hour)}:00 AQI ${String(a)}`
                    }
                  />
                );
              })}
            </div>
            <p className="small muted room-axis">
              <span>12 am</span>
              <span>6 am</span>
              <span>12 pm</span>
              <span>6 pm</span>
            </p>
            <p className="small muted">
              {hoursMeasured === 0
                ? 'No hour is long enough yet (about two minutes of readings). '
                : `${String(hoursMeasured)} hour${hoursMeasured === 1 ? '' : 's'} measured. `}
              Counted in <Link to="/exposure">Exposure</Link> for the hours you spend in your{' '}
              {where}.
            </p>
            <p className="room-legend small">
              {LEVELS.map((l) => (
                <span key={l.name} className="room-legend-item">
                  <i style={{ background: l.solid }} aria-hidden="true" /> {l.short}
                </span>
              ))}
            </p>
          </section>

          <section className="card room-insights" aria-labelledby="insights-title">
            <h2 id="insights-title">What it tells you</h2>
            <ul className="room-points">
              <li>
                {lower === undefined ? (
                  <strong>No outside reading to compare with yet</strong>
                ) : (
                  <strong>
                    Your room is {String(Math.abs(lower))}% {lower >= 0 ? 'cleaner' : 'dirtier'}{' '}
                    than outside
                  </strong>
                )}
                <span className="muted small">
                  {outside === undefined
                    ? 'Add a place on My Air.'
                    : `AQI ${String(aqi)} in the room against ${String(outside.aqi)} outside.`}
                </span>
              </li>
              {cleaner !== undefined && (
                <li>
                  <strong>Cleaner than outside {String(cleaner)}% of the time</strong>
                  <span className="muted small">
                    In the last {String(Math.round(span / 60_000))} min
                    {mean === undefined ? '' : `, averaging AQI ${String(mean)}`}.
                  </span>
                </li>
              )}
              {advice !== undefined && (
                <li>
                  <strong>{advice.title}</strong>
                  <span className="muted small">{advice.text}</span>
                </li>
              )}
            </ul>
          </section>
        </main>
      )}
      <p className="small muted room-foot">
        <strong>Measured</strong> by your own unit. A low-cost particle sensor: shown next to the
        nearest monitor’s so you can see how they compare, not an official measurement.
      </p>
    </div>
  );
}
