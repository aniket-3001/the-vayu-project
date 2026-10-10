import {
  BatteryFull,
  ChevronLeft,
  ChevronRight,
  Lock,
  RotateCw,
  RefreshCw,
  RotateCcw,
  SignalHigh,
  Wifi,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { PINS_STORAGE_KEY } from '../data/pins';
import { DEVICES_STORAGE_KEY } from '../devices/devices';
import { LIVE_STORAGE_KEY } from '../exposure/live';
import { PERSONA_STORAGE_KEY } from '../exposure/persona';
import { SPOTS_STORAGE_KEY } from '../exposure/spots';
import { TASKS_STORAGE_KEY } from '../tasks/store';
import { UNITS_STORAGE_KEY } from '../units/AirUnits';
import { SAMPLE_AS_OF } from '../today/sample';
import { clock24 } from '../today/time';
import { DEVICES, deviceById, fitScale, geometry, type DeviceId } from './devices';
import { useSize } from './useSize';
import './demo.css';

/** Everything the app saves on the device, so "Start over" really starts over. */
const RESETTABLE = [
  PINS_STORAGE_KEY,
  SPOTS_STORAGE_KEY,
  DEVICES_STORAGE_KEY,
  PERSONA_STORAGE_KEY,
  LIVE_STORAGE_KEY,
  TASKS_STORAGE_KEY,
  UNITS_STORAGE_KEY,
];

const fromUrl = (): DeviceId =>
  deviceById(new URLSearchParams(window.location.search).get('device')).id;

/** The time on the frame's status bar: the moment the sample data describes, so the two agree. */
const SAMPLE_CLOCK = clock24(SAMPLE_AS_OF);

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
        <span className="tab">Vayu Air</span>
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
  const startOver = (): void => {
    try {
      for (const key of RESETTABLE) window.localStorage.removeItem(key);
    } catch {
      // Storage may be blocked; the reload below still returns the app to its first screen.
    }
    restart();
  };

  return (
    <div className="shell">
      <header className="shell-bar">
        <div>
          <strong className="shell-name">Vayu Air</strong>
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
                  title="Vayu Air app"
                  allow="camera; geolocation; accelerometer; gyroscope; magnetometer"
                  src="?embed#/"
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
