import {
  BatteryFull,
  ChevronLeft,
  ChevronRight,
  Lock,
  Play,
  Square,
  RotateCw,
  RefreshCw,
  RotateCcw,
  SignalHigh,
  Wifi,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SAMPLE_AS_OF } from '../today/sample';
import { clock12 } from '../today/time';
import { DEVICES, deviceById, fitScale, geometry, type DeviceId } from './devices';
import {
  ALL_SCENARIOS,
  applyScenario,
  SCENARIOS,
  scenarioById,
  TOUR_SECONDS,
  type Scenario,
} from './scenarios';
import { APP_KEYS, readDemo } from './state';
import { useSize } from './useSize';
import './demo.css';

const fromUrl = (): DeviceId =>
  deviceById(new URLSearchParams(window.location.search).get('device')).id;

/** The time on the frame's status bar: the moment the sample data describes, so the two agree. */
const SAMPLE_CLOCK = clock12(SAMPLE_AS_OF);

function StatusBar({ kind }: { readonly kind: DeviceId }): React.JSX.Element | null {
  if (kind === 'laptop') return null;
  return (
    <div className="status" aria-hidden="true">
      <span className="status-time">{SAMPLE_CLOCK}</span>
      {kind === 'iphone' && <span className="island" />}
      {kind === 'android' && <span className="punch" />}
      <span className="status-icons">
        <SignalHigh size={16} strokeWidth={2} />
        <Wifi size={16} strokeWidth={2} />
        <BatteryFull size={18} strokeWidth={2} />
      </span>
    </div>
  );
}

function BrowserBar({
  onBack,
  onForward,
  onReload,
}: {
  readonly onBack: () => void;
  readonly onForward: () => void;
  readonly onReload: () => void;
}): React.JSX.Element {
  return (
    <div className="browser">
      <div className="browser-tabs" aria-hidden="true">
        <span className="traffic">
          <i /> <i /> <i />
        </span>
        <span className="tab">The Vayu Project</span>
      </div>
      <div className="browser-address">
        <button type="button" aria-label="Back" onClick={onBack}>
          <ChevronLeft size={18} />
        </button>
        <button type="button" aria-label="Forward" onClick={onForward}>
          <ChevronRight size={18} />
        </button>
        <button type="button" aria-label="Reload the app" onClick={onReload}>
          <RotateCw size={16} />
        </button>
        <span className="url" aria-hidden="true">
          <Lock size={13} /> vayuair.in
        </span>
      </div>
    </div>
  );
}

/**
 * A clickable prototype: the real app running inside a phone, tablet or laptop. The app is a page in
 * an iframe, so its layout answers to the frame's size, exactly as it would on that device.
 */
export function DeviceShell(): React.JSX.Element {
  const [deviceId, setDeviceId] = useState<DeviceId>(fromUrl);
  const [landscape, setLandscape] = useState(false);
  const [run, setRun] = useState(0);
  const [route, setRoute] = useState(
    () => scenarioById(new URLSearchParams(window.location.search).get('demo'))?.route ?? '/',
  );
  const [active, setActive] = useState<string | undefined>(() => readDemo()?.id);
  const [step, setStep] = useState<number | undefined>(undefined);
  const [stageRef, stage] = useSize<HTMLDivElement>();
  const frame = useRef<HTMLIFrameElement>(null);
  const device = deviceById(deviceId);
  const isLaptop = device.id === 'laptop';
  const g = geometry(device, landscape);
  const scale = fitScale(g.outerWidth, g.outerHeight, stage.width - 32, stage.height - 32);
  const lidWidth = g.outerWidth - (isLaptop ? 120 : 0);
  const lidHeight = g.outerHeight - (isLaptop ? 22 : 0);

  const choose = (id: DeviceId): void => {
    setDeviceId(id);
    setLandscape(false);
    window.history.replaceState(null, '', `?device=${id}`);
  };
  const go = (step: -1 | 1): void => {
    try {
      frame.current?.contentWindow?.history.go(step);
    } catch {
      // A frame we cannot reach has nothing to go back to.
    }
  };
  const restart = (): void => {
    setRun((n) => n + 1);
  };
  const stageScenario = useCallback((scenario: Scenario): void => {
    setRoute(applyScenario(window.localStorage, scenario));
    setActive(scenario.id);
    setRun((n) => n + 1);
  }, []);
  const pick = (scenario: Scenario): void => {
    setStep(undefined);
    stageScenario(scenario);
  };
  // The tour walks the scenarios in order, a few seconds each, and stops at the end.
  useEffect(() => {
    if (step === undefined) return undefined;
    const scenario = SCENARIOS[step];
    if (scenario === undefined) {
      setStep(undefined);
      return undefined;
    }
    stageScenario(scenario);
    const timer = window.setTimeout(() => {
      setStep(step + 1);
    }, scenario.seconds * 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [step, stageScenario]);
  const playing = step === undefined ? undefined : SCENARIOS[step];
  const startOver = (): void => {
    setStep(undefined);
    setActive(undefined);
    setRoute('/');
    try {
      for (const key of APP_KEYS) window.localStorage.removeItem(key);
    } catch {
      // Storage may be blocked; the reload below still returns the app to its first screen.
    }
    restart();
  };

  return (
    <div className="shell">
      <header className="shell-bar">
        <div>
          <strong className="shell-name">The Vayu Project</strong>
          <span className="muted small">
            {' '}
            Prototype. The air is made up; the screens are the real app.
          </span>
        </div>
        <div className="shell-controls">
          <div className="segmented" role="group" aria-label="Device">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={deviceId === d.id}
                onClick={() => {
                  choose(d.id);
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
          {device.canRotate && (
            <button
              type="button"
              className="shell-button"
              aria-pressed={landscape}
              onClick={() => {
                setLandscape((v) => !v);
              }}
            >
              <RotateCcw size={16} aria-hidden="true" /> Rotate
            </button>
          )}
          <button type="button" className="shell-button" onClick={startOver}>
            <RefreshCw size={16} aria-hidden="true" /> Start over
          </button>
          <a className="shell-button" href="?embed" target="_blank" rel="noreferrer">
            Open on its own
          </a>
        </div>
      </header>
      <section className="scenes" aria-label="Demo scenarios">
        <button
          type="button"
          className="primary scene-play"
          onClick={() => {
            setStep(step === undefined ? 0 : undefined);
          }}
        >
          {step === undefined ? (
            <>
              <Play size={16} aria-hidden="true" /> Play the {String(Math.round(TOUR_SECONDS))}
              -second tour
            </>
          ) : (
            <>
              <Square size={16} aria-hidden="true" /> Stop the tour
            </>
          )}
        </button>
        <div className="scene-chips" role="group" aria-label="Scenarios">
          {ALL_SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              aria-pressed={active === scenario.id}
              onClick={() => {
                pick(scenario);
              }}
            >
              {scenario.label}
            </button>
          ))}
        </div>
        {playing !== undefined && step !== undefined && (
          <p className="scene-caption" role="status">
            <strong>
              {String(step + 1)} of {String(SCENARIOS.length)} · {playing.label}.
            </strong>{' '}
            {playing.caption}
            <span
              key={step}
              className="scene-bar"
              style={{ animationDuration: `${String(playing.seconds)}s` }}
            />
          </p>
        )}
      </section>
      <div className="stage" ref={stageRef}>
        <div className="fit">
          <div className="lid-wrap" style={{ width: lidWidth * scale, height: lidHeight * scale }}>
            <div
              className={`device device-${device.id}${landscape && device.canRotate ? ' is-landscape' : ''}`}
              data-testid="device"
              style={{
                width: lidWidth,
                height: lidHeight,
                padding: device.bezel,
                borderRadius: device.radius + device.bezel,
                transform: `scale(${String(scale)})`,
              }}
            >
              <div className="screen" style={{ borderRadius: device.radius }}>
                <div className="chrome-top" style={{ height: device.top }}>
                  <StatusBar kind={device.id} />
                  {isLaptop && (
                    <BrowserBar
                      onBack={() => {
                        go(-1);
                      }}
                      onForward={() => {
                        go(1);
                      }}
                      onReload={restart}
                    />
                  )}
                </div>
                <iframe
                  key={run}
                  ref={frame}
                  title="The Vayu Project app"
                  allow="camera; geolocation; accelerometer; gyroscope; magnetometer"
                  src={`?embed#${route}`}
                  width={g.appWidth}
                  height={g.appHeight}
                />
                <div className="chrome-bottom" style={{ height: device.bottom }} aria-hidden="true">
                  {!isLaptop && <span className="home-bar" />}
                </div>
              </div>
            </div>
          </div>
          {isLaptop && (
            <div
              className="laptop-base"
              style={{ width: (lidWidth + 120) * scale, height: 22 * scale }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
