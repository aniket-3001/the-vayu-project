import { Briefcase, GraduationCap, House, MapPin, TreePine, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { airStore, useToday } from '../air/store';
import { AirError, AirLoading } from '../components/AirState';
import { AqiScale } from '../components/AqiScale';
import { liveLocation, useLivePin } from '../places/liveLocation';
import { usePins } from '../places/usePins';
import { clock12, dayMonth, hourName, hourOfDay as hourOfDayOf, weekday } from '../today/time';
import { TimelineWindow } from '../components/TimelineWindow';
import { HazeCanvas } from './HazeCanvas';
import { LIVE_OUTDOOR_NAME, LensCard } from './LensCard';
import { DIAL_HOURS, bestHour, hazeFor, isNight, lensSeries, windOnScreen } from './model';
import { SampleScene, sceneFor, type ScenePlace } from './SampleScene';

const SCENE_ICONS: Readonly<Record<ScenePlace, LucideIcon>> = {
  home: House,
  school: GraduationCap,
  work: Briefcase,
  park: TreePine,
  street: MapPin,
};
import { useCamera } from './useCamera';

/** Said on the card only when the camera is being asked for or could not be had. */
const CAMERA_WORDS = {
  asking: 'Asking for your camera…',
  denied: 'Camera not allowed, so an illustration stands in.',
  unavailable: 'No camera here, so an illustration stands in.',
} as const;

/** What the number means, drawn over what is in front of you: haze, wind, how far you can see, and when to go out. */
export function LensScreen(): React.JSX.Element {
  const { pins: pinned } = usePins();
  const livePin = useLivePin();
  // The live place comes first while live location is on.
  const pins = useMemo(
    () => (livePin === undefined ? pinned : [livePin, ...pinned]),
    [livePin, pinned],
  );
  const [placeId, setPlaceId] = useState('');
  const [step, setStep] = useState(0);
  const hud = useRef<HTMLDivElement>(null);
  const camera = useCamera();

  const pin = pins.find((p) => p.id === placeId) ?? pins[0];
  // The switch on the card: where you are (live outdoor location) and every pinned place.
  const placeOptions = useMemo(
    () => [
      { id: 'live', name: LIVE_OUTDOOR_NAME },
      ...pinned.map((p) => ({ id: p.id, name: p.name })),
    ],
    [pinned],
  );
  const choosePlace = (id: string): void => {
    setStep(0);
    setPlaceId(id);
    // Choosing where you are asks the browser, if it has not been asked.
    if (id === 'live' && !liveLocation().get().enabled) liveLocation().set(true);
  };
  const state = useToday(pin);
  const data = state?.status === 'ready' ? state.data : undefined;
  const series = useMemo(() => (data === undefined ? [] : lensSeries(data)), [data]);
  const hour = series[Math.min(step, series.length - 1)];

  // The buttons that stay on every screen sit just above this panel, so tell the page how tall it is.
  useEffect(() => {
    const panel = hud.current;
    const root = document.documentElement;
    if (panel === null || typeof ResizeObserver === 'undefined') return;
    const report = (): void => {
      root.style.setProperty('--dock-lift', `${String(Math.round(panel.offsetHeight) + 6)}px`);
    };
    report();
    const watcher = new ResizeObserver(report);
    watcher.observe(panel);
    return () => {
      watcher.disconnect();
      root.style.removeProperty('--dock-lift');
    };
  });

  if (pin === undefined || data === undefined || hour === undefined) {
    return (
      <div className="page places">
        <header className="place">
          <h1>AR Lens</h1>
        </header>
        <main className="places-main">
          {pin === undefined ? (
            <div className="empty lens-empty">
              <p>Nothing pinned yet, so there is no air to show.</p>
              <div className="lens-empty-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    liveLocation().set(true);
                  }}
                >
                  Use where I am
                </button>
                <Link to="/" className="plain">
                  Pin a place on My Air
                </Link>
              </div>
            </div>
          ) : state?.status === 'error' ? (
            <AirError
              message={state.message}
              onRetry={() => {
                airStore().ensureToday(pin, true);
              }}
            />
          ) : (
            <AirLoading what={`the air at ${pin.name}`} />
          )}
        </main>
      </div>
    );
  }

  const PlaceIcon = SCENE_ICONS[sceneFor(pin.name)];
  const haze = hazeFor(hour.pm25, hour.aqi);
  const best = bestHour(series);
  // North is up: with no compass, the wind's arrow points the way it blows on a map.
  const arrow = hour.wind === undefined ? 0 : windOnScreen(hour.wind.fromDeg, 0);
  const when = step === 0 ? 'Now' : `${weekday(hour.at)} ${dayMonth(hour.at)}, ${clock12(hour.at)}`;
  // The labels under the line: now, then every six hours, with the day's name at midnight.
  const ticks = series.flatMap((h, i) => {
    const hourOfDay = Math.floor(hourOfDayOf(h.at));
    if (i === 0) return [{ index: 0, label: 'Now' }];
    if (hourOfDay % 6 !== 0 || i < 3) return [];
    return [{ index: i, label: hourOfDay === 0 ? weekday(h.at) : hourName(hourOfDay) }];
  });

  return (
    <div className="lens-screen">
      <div className="lens-view">
        {camera.state === 'on' ? (
          <video ref={camera.video} className="scene" playsInline muted aria-hidden="true" />
        ) : (
          <SampleScene night={isNight(hour)} place={sceneFor(pin.name)} />
        )}
        <HazeCanvas haze={haze} windToDeg={arrow} windKmh={hour.wind?.kmh ?? 0} />
      </div>

      <div className="lens-hud" ref={hud}>
        <LensCard
          pin={pin}
          data={data}
          hour={hour}
          step={step}
          best={best}
          camera={{
            on: camera.state === 'on',
            toggle: camera.state === 'on' ? camera.stop : camera.start,
          }}
          places={{
            options: placeOptions,
            activeId: pin.id,
            onChange: choosePlace,
          }}
          cameraWords={
            camera.state === 'off' || camera.state === 'on' ? undefined : CAMERA_WORDS[camera.state]
          }
          icon={PlaceIcon}
        />

        <section className="lens-dial" aria-label="Time">
          <AqiScale aqi={hour.aqi} className="lens-scale" />
          <TimelineWindow
            slots={series.map((h) => ({ aqi: h.aqi }))}
            value={step}
            onChange={setStep}
            label="Time, hours from now"
            valueText={when}
            ticks={ticks}
            nowIndex={0}
            bubble={step === 0 ? 'Now' : clock12(hour.at)}
            max={Math.min(DIAL_HOURS, series.length - 1)}
          />
          <p className="muted small lens-hint">
            {step === 0 ? 'Slide the window along the next day and a half' : `in ${String(step)} h`}
          </p>
        </section>
      </div>
    </div>
  );
}
