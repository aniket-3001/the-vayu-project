import {
  Briefcase,
  GraduationCap,
  House,
  MapPin,
  Pause,
  Play,
  TreePine,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { airStore, useToday } from '../air/store';
import { AirError, AirLoading } from '../components/AirState';
import { AqiScale } from '../components/AqiScale';
import { liveLocation, useLiveLocation, useLivePin } from '../places/liveLocation';
import { samePlace } from '../places/roles';
import { usePins } from '../places/usePins';
import { clock12, dayMonth, hourName, hourOfDay as hourOfDayOf, weekday } from '../today/time';
import { TimelineWindow } from '../components/TimelineWindow';
import { HazeCanvas } from './HazeCanvas';
import { LIVE_LOCATION_NAME, LensCard } from './LensCard';
import { DockButtons } from '../nav/Dock';
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

/** How long the play button takes to run through the whole of the next 36 hours. */
const PLAY_SECONDS = 5;

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
  const here = useLiveLocation().position;
  // The live place comes first while live location is on.
  const pins = useMemo(
    () => (livePin === undefined ? pinned : [livePin, ...pinned]),
    [livePin, pinned],
  );
  const [placeId, setPlaceId] = useState('');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const camera = useCamera();

  const pin = pins.find((p) => p.id === placeId) ?? pins[0];
  // The switch on the card: where you are (live outdoor location) and every pinned place.
  const placeOptions = useMemo(
    () => [
      { id: 'live', name: LIVE_LOCATION_NAME },
      ...pinned.map((p) => ({ id: p.id, name: p.name })),
    ],
    [pinned],
  );
  // The live place is called what it is the same as, when it is at a saved place.
  const sameAs =
    here === undefined ? undefined : pinned.find((p) => samePlace(p, here, 0.005))?.name;
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
  const lastStep = Math.max(0, Math.min(DIAL_HOURS, series.length - 1));
  // Playing steps the window along the whole run in five seconds, and stops at the end.
  useEffect(() => {
    if (!playing || lastStep === 0) return undefined;
    const timer = window.setInterval(
      () => {
        setStep((current) => {
          if (current >= lastStep) {
            setPlaying(false);
            return current;
          }
          return current + 1;
        });
      },
      PLAY_SECONDS * (1000 / lastStep),
    );
    return () => {
      window.clearInterval(timer);
    };
  }, [playing, lastStep]);

  if (pin === undefined || data === undefined || hour === undefined) {
    return (
      <div className="page places">
        <header className="place">
          <h1>AIR Lens</h1>
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
  // The labels under the line: now, then noon and midnight, with the day's name at midnight.
  const ticks = series.flatMap((h, i) => {
    const hourOfDay = Math.floor(hourOfDayOf(h.at));
    if (i === 0) return [{ index: 0, label: 'Now' }];
    if (hourOfDay % 12 !== 0 || i < 4) return [];
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

      <div className="lens-hud">
        {/* One card, top to bottom: the colour scale, the air, then the hour window with the three buttons. */}
        <section className="lens-unit" aria-label="The air here, hour by hour">
          <div className="lens-unit-scale">
            <AqiScale aqi={hour.aqi} className="lens-scale" />
          </div>
          <LensCard
            pin={pin}
            data={data}
            hour={hour}
            step={step}
            best={best}
            sameAs={sameAs}
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
              camera.state === 'off' || camera.state === 'on'
                ? undefined
                : CAMERA_WORDS[camera.state]
            }
            icon={PlaceIcon}
          />
          <div className="lens-unit-time" aria-label="Time">
            <div className="lens-time-slider">
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
              <div className="lens-hint-row">
                <button
                  type="button"
                  className="lens-play"
                  aria-pressed={playing}
                  aria-label={playing ? 'Pause the 36 hours' : 'Play the next 36 hours'}
                  onClick={() => {
                    if (playing) {
                      setPlaying(false);
                      return;
                    }
                    // From the start again if it is at the end; the whole run takes five seconds.
                    if (step >= lastStep) setStep(0);
                    setPlaying(true);
                  }}
                >
                  {playing ? (
                    <Pause size={16} strokeWidth={2.5} aria-hidden="true" />
                  ) : (
                    <Play size={16} strokeWidth={2.5} aria-hidden="true" />
                  )}
                </button>
                <p className="muted small lens-hint">
                  {step === 0 ? 'Slide the window along the next 36 hours' : `in ${String(step)} h`}
                </p>
              </div>
            </div>
            <DockButtons layout="row" />
          </div>
        </section>
      </div>
    </div>
  );
}
