import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { levelForAqi, LEVELS } from '../../design/levels';
import { today } from '../../exposure/model';
import { SPOT_LABELS } from '../../exposure/spots';
import { concentration, levelVars } from '../../today/ui/format';
import { usAqi } from '@vayu/core';
import { Bluetooth } from 'lucide-react';
import type { UnitTransport } from '../ble';
import { measuredHourly } from '../measured';
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
 * The room, opened out: the live line of the room against the air outside, what that gap is made of, and the room's day.
 * It is the page for "what is the air I am breathing in this room, and what is my purifier or my window doing to it".
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
      <header className="place">
        {back}
        <h1>Your room</h1>
        <p className="muted">
          {device.name} · in your {where} ·{' '}
          {live
            ? 'Connected'
            : unit.state.status === 'connecting'
              ? 'Connecting…'
              : 'Not connected'}
        </p>
      </header>
      <main className="layout room-layout">
        {reading === undefined || aqi === undefined || level === undefined ? (
          <section className="card col-wide">
            <h2>Connect to see the live air</h2>
            <p className="muted">
              Switch the unit on and press the button. Chrome will ask which unit; pick{' '}
              {device.name}.
            </p>
            {unit.supported ? (
              <button
                type="button"
                className="primary"
                disabled={unit.state.status === 'connecting'}
                onClick={() => {
                  void unit.connect(() => device.id);
                }}
              >
                <Bluetooth size={16} aria-hidden="true" />{' '}
                {unit.state.status === 'connecting' ? 'Connecting…' : 'Connect over Bluetooth'}
              </button>
            ) : (
              <p className="small" role="status">
                This browser cannot connect over Bluetooth. Use Chrome on an Android phone or a
                computer.
              </p>
            )}
            {unit.state.problem !== undefined && (
              <p className="small unit-problem" role="status">
                {unit.state.problem}
              </p>
            )}
          </section>
        ) : (
          <>
            <section className="card room-hero" aria-label="The room now">
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
              <p className="small muted" role="status">
                {reading.warming
                  ? 'The sensor is warming up. This number is shown but not counted yet.'
                  : !live || stale
                    ? `No reading for ${String(ageS ?? 0)} seconds. The unit may be out of range.`
                    : `Updated ${String(ageS ?? 0)} second${ageS === 1 ? '' : 's'} ago.`}
              </p>
              {!live && unit.supported && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    void unit.connect(() => device.id);
                  }}
                >
                  <Bluetooth size={16} aria-hidden="true" /> Connect again
                </button>
              )}
            </section>

            <section className="card col-wide" aria-labelledby="room-vs-title">
              <div className="card-head">
                <h2 id="room-vs-title">The room against outside, live</h2>
              </div>
              <LiveChart
                points={recent}
                height={230}
                {...(outside === undefined ? {} : { outsidePm25: outside.pm25 })}
                marks={marks}
              />
              <p className="room-key small">
                <span className="k k-room" /> Room, from your unit{' '}
                {outside !== undefined && (
                  <>
                    <span className="k k-outside" /> Outside at {pin?.name ?? 'your place'}
                    {p?.stationName !== undefined && p.distanceKm !== undefined
                      ? `, ${p.stationName}, ${String(Math.round(p.distanceKm * 10) / 10)} km away`
                      : ' (regional model)'}
                  </>
                )}
              </p>
              {outside === undefined && (
                <p className="small muted">
                  {comparison.status === 'none'
                    ? 'Add a place on My Air to see the air outside as a second line.'
                    : comparison.status === 'error'
                      ? 'The air outside could not be loaded just now.'
                      : 'Getting the air outside…'}
                </p>
              )}
              <p className="small muted">
                The room line moves with every reading (about every two seconds). The outside line
                is the nearest monitor’s latest reading, which changes about once an hour.
              </p>
            </section>

            <section className="card" aria-labelledby="gap-title">
              <h2 id="gap-title">The gap</h2>
              <dl className="room-stats">
                <div>
                  <dt>Room vs outside</dt>
                  <dd className="tnum">
                    {lower === undefined
                      ? '–'
                      : lower >= 0
                        ? `${String(lower)}% lower`
                        : `${String(-lower)}% higher`}
                  </dd>
                </div>
                <div>
                  <dt>Cleaner than outside</dt>
                  <dd className="tnum">
                    {cleaner === undefined ? '–' : `${String(cleaner)}% of the time`}
                  </dd>
                </div>
                <div>
                  <dt>Average, this window</dt>
                  <dd className="tnum">{mean === undefined ? '–' : `AQI ${String(mean)}`}</dd>
                </div>
                <div>
                  <dt>Low · high</dt>
                  <dd className="tnum">
                    {aqis.length === 0
                      ? '–'
                      : `${String(Math.min(...aqis))} · ${String(Math.max(...aqis))}`}
                  </dd>
                </div>
                <div>
                  <dt>Fine share of PM10</dt>
                  <dd className="tnum">
                    {reading.pm10 > 0
                      ? `${String(Math.round((reading.pm25 / reading.pm10) * 100))}%`
                      : '–'}
                  </dd>
                </div>
              </dl>
              <p className="small muted">
                Smoke and exhaust are mostly fine particles; dust and sweeping are coarser, so a low
                share points to dust.
              </p>
            </section>

            <section className="card" aria-labelledby="test-title">
              <h2 id="test-title">See what changes the air</h2>
              <p className="small muted">
                Press when you switch the purifier on or open a window. The line is marked, and this
                shows how far the room’s air moved since.
              </p>
              <div className="choice-row">
                {TEST_LABELS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="choice"
                    aria-pressed={mark?.label === label}
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
              {mark !== undefined && change !== undefined && nowPm !== undefined && (
                <p className="room-test" role="status">
                  <strong>{mark.label}</strong>,{' '}
                  {String(Math.max(0, Math.round((nowMs - mark.atMs) / 60_000)))} min ago: PM2.5{' '}
                  {concentration(mark.pm25)} → {concentration(nowPm)} µg/m³,{' '}
                  <strong>
                    {change >= 0 ? `${String(change)}% lower` : `${String(-change)}% higher`}
                  </strong>
                  .
                  {half !== undefined && mark.pm25 > 0
                    ? ` It halved in ${String(Math.max(1, Math.round((half - mark.atMs) / 60_000)))} min.`
                    : ''}
                </p>
              )}
            </section>

            {advice !== undefined && (
              <section className="card col-wide" aria-labelledby="advice-title">
                <h2 id="advice-title">{advice.title}</h2>
                <p>{advice.text}</p>
                <p className="small muted">Our advice from two numbers, not a health order.</p>
              </section>
            )}
          </>
        )}

        <section className="card col-wide" aria-labelledby="day-title">
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
              ? 'No hour is long enough yet. An hour counts after about two minutes of readings.'
              : `${String(hoursMeasured)} hour${hoursMeasured === 1 ? '' : 's'} measured today.`}{' '}
            Hours you spend in your {where} are counted in <Link to="/exposure">Exposure</Link> from
            these, in place of the outside reading at the address.
          </p>
          <p className="room-legend small">
            {LEVELS.map((l) => (
              <span key={l.name} className="room-legend-item">
                <i style={{ background: l.solid }} aria-hidden="true" /> {l.short}
              </span>
            ))}
          </p>
        </section>

        <section className="card col-wide" aria-label="About this unit">
          <p className="small muted">
            <strong>Measured</strong> by your own unit. A low-cost particle sensor: its readings are
            shown next to the nearest monitor’s so you can see how they compare, and are not an
            official measurement.
          </p>
          <div className="form-actions">
            {live && (
              <button type="button" className="plain" onClick={unit.disconnect}>
                Disconnect
              </button>
            )}
            <button
              type="button"
              className="plain"
              onClick={() => {
                if (unit.state.deviceId === device.id) unit.disconnect();
                remove(device.id);
                navigate('/');
              }}
            >
              Remove this unit
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
