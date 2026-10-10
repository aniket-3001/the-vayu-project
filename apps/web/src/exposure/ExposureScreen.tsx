import { Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PlaceMatch } from '../data/geocode';
import { useDevices } from '../devices/useDevices';
import { usePins } from '../places/usePins';
import { ASSUMPTION_NOTES } from './assumptions';
import {
  countedCells,
  dayCells,
  hoursSoFar,
  openAirFor,
  summarise,
  type Day,
  type Where,
} from './model';
import { SPOT_KINDS, SPOT_LABELS, type SpotKind } from './spots';
import { Dial, WHERE_LABELS } from './ui/Dial';
import { LiveCard } from './ui/LiveCard';
import { SpotSection } from './ui/SpotSection';
import { Summary } from './ui/Summary';
import { useLive, useSpots } from './useExposure';
import { levelForAqi } from '../design/levels';
import { SAMPLE_SOURCES } from './sources';

type Tab = 'all' | SpotKind;

const hourSpan = (hour: number): string =>
  `${String(hour).padStart(2, '0')}:00 to ${String((hour + 1) % 24).padStart(2, '0')}:00`;

/** Today's exposure: a 24-hour dial, what it adds up to, and the places and live location behind it. */
export function ExposureScreen({
  search,
}: {
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
}): React.JSX.Element {
  const { spots, set, clear } = useSpots();
  const { devices } = useDevices();
  const { pins, add: addPin } = usePins();
  const live = useLive();
  const [day, setDay] = useState<Day>('today');
  const [tab, setTab] = useState<Tab>('all');
  const [picked, setPicked] = useState(Math.max(0, hoursSoFar('today') - 1));
  const [showInfo, setShowInfo] = useState(false);

  const cells = useMemo(
    () => dayCells(spots, devices, live.log, day),
    [spots, devices, live.log, day],
  );
  const shown = tab === 'all' ? cells : cells.filter((cell) => cell.where === tab);
  const counted = tab === 'all' ? countedCells(cells) : shown;
  const summary = summarise(counted, openAirFor(counted, spots, live.log, day));
  const setKinds = new Set<Where>(SPOT_KINDS.filter((kind) => spots[kind] !== undefined));
  if (Object.keys(live.log).length > 0) setKinds.add('live');
  const atPicked = shown.filter((cell) => cell.hour === picked);
  const now = day === 'today' ? hoursSoFar('today') + 0.5 : undefined;
  const kinds = tab === 'all' ? SPOT_KINDS : [tab];

  return (
    <div className="page places">
      <header className="place">
        <div className="title-row">
          <h1>{day === 'today' ? 'Today’s exposure' : 'Yesterday’s exposure'}</h1>
          <button
            type="button"
            className="icon-button"
            aria-label="How this is worked out"
            aria-expanded={showInfo}
            onClick={() => {
              setShowInfo((v) => !v);
            }}
          >
            <Info size={22} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {showInfo && (
          <div className="info-box" role="note">
            <p>
              Each hour takes the air at the place you were, then adjusts it for where in that place
              you were. We say which parts are assumed.
            </p>
            <ul>
              {ASSUMPTION_NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p className="muted small">{SAMPLE_SOURCES}</p>
          </div>
        )}
        <div className="segmented wide" role="group" aria-label="Day">
          {(['today', 'yesterday'] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={day === d}
              onClick={() => {
                setDay(d);
                setPicked(d === 'today' ? Math.max(0, hoursSoFar('today') - 1) : 12);
              }}
            >
              {d === 'today' ? 'Today' : 'Yesterday'}
            </button>
          ))}
        </div>
        <div className="segmented wide kinds" role="group" aria-label="Show">
          {(['all', ...SPOT_KINDS] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => {
                setTab(t);
              }}
            >
              {t === 'all' ? 'All' : SPOT_LABELS[t]}
            </button>
          ))}
        </div>
      </header>
      <main className="exposure-main">
        <div className="dial-wrap">
          <Dial
            cells={shown}
            show={tab}
            nowHour={now}
            picked={picked}
            onPick={setPicked}
            set={setKinds}
          />
        </div>
        <div className="hour-picker">
          <label htmlFor="hour">Hour</label>
          <input
            id="hour"
            type="range"
            min={0}
            max={23}
            value={picked}
            onChange={(event) => {
              setPicked(Number(event.target.value));
            }}
          />
          <output htmlFor="hour">{hourSpan(picked)}</output>
        </div>
        <div className="readout" aria-live="polite">
          {atPicked.length === 0 ? (
            <p className="muted">
              {picked >= hoursSoFar(day) && day === 'today'
                ? 'That hour has not happened yet.'
                : 'No place set for this hour.'}
            </p>
          ) : (
            <ul>
              {atPicked.map((cell) => (
                <li key={cell.where}>
                  <span
                    className="chip"
                    style={{
                      background: levelForAqi(cell.aqi).solid,
                      color: levelForAqi(cell.aqi).onSolid,
                    }}
                  >
                    {cell.aqi}
                  </span>
                  <span>
                    <strong>{WHERE_LABELS[cell.where]}</strong>,{' '}
                    {levelForAqi(cell.aqi).name.toLowerCase()}. {cell.pm25} µg/m³ PM<sub>2.5</sub>
                    {cell.source === 'assumed' || cell.source === 'trees' ? ' (assumed)' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Summary summary={summary} cells={counted} day={day} />
        {kinds.map((kind) => (
          <SpotSection
            key={kind}
            kind={kind}
            spot={spots[kind]}
            pins={pins}
            devices={devices}
            onSet={(spot) => {
              set(kind, spot);
            }}
            onClear={() => {
              clear(kind);
            }}
            onAddPin={addPin}
            {...(search !== undefined ? { search } : {})}
          />
        ))}
        {tab === 'all' && (
          <LiveCard
            state={live.state}
            sample={live.sample}
            hours={Object.keys(live.log).length}
            onStart={live.start}
            onStop={live.stop}
            onSample={live.showSample}
            onClear={live.clearLog}
          />
        )}
      </main>
    </div>
  );
}
