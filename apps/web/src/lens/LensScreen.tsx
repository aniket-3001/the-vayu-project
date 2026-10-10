import { Camera, CameraOff, Compass, Eye, Navigation } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { levelForAqi } from '../design/levels';
import { readingForPin } from '../places/placeSample';
import { usePins } from '../places/usePins';
import { compassPoint } from '../today/wind';
import { clock24, dayMonth, weekday } from '../today/time';
import { Pill } from '../today/ui/Chip';
import { concentration } from '../today/ui/format';
import { HazeCanvas } from './HazeCanvas';
import {
  DIAL_HOURS,
  bestHour,
  formatDistance,
  hazeFor,
  isNight,
  lensSeries,
  visibilityKm,
  windOnScreen,
} from './model';
import { SampleScene } from './SampleScene';
import { useCamera } from './useCamera';
import { useHeading } from './useHeading';

const CAMERA_WORDS = {
  off: 'Sample street, camera off.',
  asking: 'Asking for your camera…',
  on: 'Camera on; nothing leaves this phone.',
  denied: 'Camera not allowed, so a sample street.',
  unavailable: 'No camera here, so a sample street.',
} as const;

/** What the number means, drawn over what is in front of you: haze, wind, how far you can see, and when to go out. */
export function LensScreen(): React.JSX.Element {
  const { pins } = usePins();
  const [placeId, setPlaceId] = useState('');
  const [step, setStep] = useState(0);
  const camera = useCamera();
  const compass = useHeading();

  const pin = pins.find((p) => p.id === placeId) ?? pins[0];
  const data = useMemo(() => (pin === undefined ? undefined : readingForPin(pin)), [pin]);
  const series = useMemo(() => (data === undefined ? [] : lensSeries(data)), [data]);
  const hour = series[Math.min(step, series.length - 1)];

  if (pin === undefined || data === undefined || hour === undefined) {
    return (
      <div className="page places">
        <header className="place">
          <h1>AR Lens</h1>
        </header>
        <main className="places-main">
          <p className="empty">
            Nothing pinned yet, so there is no air to show.{' '}
            <Link to="/">Pin a place on My Air</Link>
          </p>
        </main>
      </div>
    );
  }

  const level = levelForAqi(hour.aqi);
  const haze = hazeFor(hour.pm25, hour.aqi);
  const sight = visibilityKm(hour.pm25);
  const best = bestHour(series);
  const heading = compass.heading ?? 0;
  const arrow = windOnScreen(hour.windFromDeg, heading);
  const when = step === 0 ? 'Now' : `${weekday(hour.at)} ${dayMonth(hour.at)}, ${clock24(hour.at)}`;
  const track = `linear-gradient(to right, ${series
    .map(
      (h, i) =>
        `${levelForAqi(h.aqi).solid} ${String((i / series.length) * 100)}% ${String(((i + 1) / series.length) * 100)}%`,
    )
    .join(', ')})`;

  const advice =
    best === undefined
      ? undefined
      : best.aqi > 150
        ? 'No clean hour outside today. If you can stay in, do.'
        : `Cleanest daylight hour: ${clock24(best.at)}, AQI ${String(best.aqi)}.`;

  return (
    <div className="lens-screen">
      <div className="lens-view">
        {camera.state === 'on' ? (
          <video ref={camera.video} className="scene" playsInline muted aria-hidden="true" />
        ) : (
          <SampleScene night={isNight(hour)} />
        )}
        <HazeCanvas haze={haze} windToDeg={arrow} windKmh={hour.windKmh} />
      </div>

      <div className="lens-top">
        <label className="lens-place">
          <span className="sr-only">Place to look at</span>
          <select
            value={pin.id}
            onChange={(event) => {
              setPlaceId(event.target.value);
              setStep(0);
            }}
          >
            {pins.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="lens-button"
          onClick={camera.state === 'on' ? camera.stop : camera.start}
          aria-pressed={camera.state === 'on'}
        >
          {camera.state === 'on' ? (
            <CameraOff size={18} aria-hidden="true" />
          ) : (
            <Camera size={18} aria-hidden="true" />
          )}
          {camera.state === 'on' ? 'Camera off' : 'Use camera'}
        </button>
      </div>

      <div className="lens-hud">
        <section className="lens-card" aria-label="The air here">
          <div className="lens-row">
            <p className="lens-number" style={{ background: level.solid, color: level.onSolid }}>
              <strong className="tnum">{hour.aqi}</strong>
              <span>AQI</span>
            </p>
            <div>
              <p className="lens-level">
                {level.name}
                <span className="muted small">
                  {' '}
                  · {concentration(hour.pm25)} µg/m³ PM<sub>2.5</sub>
                </span>
              </p>
              <p className="lens-wind">
                <Navigation
                  size={16}
                  strokeWidth={2}
                  aria-hidden="true"
                  style={{ transform: `rotate(${String(arrow)}deg)` }}
                />
                From the {compassPoint(hour.windFromDeg)}, {hour.windKmh} km/h
              </p>
            </div>
          </div>
          <p className="lens-line">
            <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>
              You could see about <strong>{formatDistance(sight)}</strong>
            </span>
            <Pill>Estimate</Pill>
          </p>
          {advice !== undefined && <p className="lens-line lens-advice">{advice}</p>}
          <p className="lens-foot muted small">
            {compass.needsTap ? (
              <button type="button" className="link-button" onClick={compass.enable}>
                <Compass size={14} aria-hidden="true" /> Turn on the compass
              </button>
            ) : (
              <span>
                {compass.heading === undefined
                  ? 'North is up.'
                  : `Facing ${compassPoint(compass.heading)}.`}
              </span>
            )}
            <span role="status">{CAMERA_WORDS[camera.state]}</span>
            <Pill>Sample data</Pill>
          </p>
        </section>

        <section className="lens-dial" aria-label="Time">
          <div className="dial-labels">
            <span>{when}</span>
            <span className="muted small">
              {step === 0 ? 'Drag for the next day and a half' : `in ${String(step)} h`}
            </span>
          </div>
          <div className="dial-track" style={{ background: track }}>
            <input
              type="range"
              min={0}
              max={Math.min(DIAL_HOURS, series.length - 1)}
              value={step}
              aria-label="Time, hours from now"
              aria-valuetext={when}
              onChange={(event) => {
                setStep(Number(event.target.value));
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
