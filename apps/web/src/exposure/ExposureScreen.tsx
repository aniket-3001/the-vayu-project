import { CalendarDays, Info, LocateFixed, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PlaceMatch } from '../data/geocode';
import { useDevices } from '../devices/useDevices';
import { levelForAqi } from '../design/levels';
import { airStore, useHistory } from '../air/store';
import { AirError, AirLoading } from '../components/AirState';
import { pinId, type Pin } from '../data/pins';
import { usePins } from '../places/usePins';
import { Progress } from '../tasks/ui/TipsCard';
import { SmokeNote } from '../units/AirUnits';
import { ASSUMPTION_NOTES } from './assumptions';
import {
  today,
  yesterday,
  countedCells,
  dayCells,
  daySummary,
  formatDate,
  hasData,
  hoursSoFar,
  lastWeek,
  openAirFor,
  summarise,
  type DateKey,
  type Where,
} from './model';
import { personaById } from './persona';
import { DAY_LABELS, initials, MAX_PEOPLE, personaOf } from './people';
import { SPOT_LABELS, loadAllSpots, type SpotKind } from './spots';
import { sourcesNote } from './sources';
import { Dial, DialKey, WHERE_LABELS } from './ui/Dial';
import { Summary } from './ui/Summary';
import { WeekStrip } from './ui/WeekStrip';
import { allUnits } from './units';
import { useHousehold, useLive, useOutings, useSpots } from './useExposure';
import { AddPerson } from './ui/AddPerson';
import { OutingSheet } from './ui/OutingSheet';
import { PersonPanel } from './ui/PersonPanel';
import { saveSpots } from './spots';

/** The week overview, or one date. */
type View = DateKey;
const WEEK = 'week';
type Tab = 'all' | SpotKind;

const hourSpan = (hour: number): string =>
  `${String(hour).padStart(2, '0')}:00 to ${String((hour + 1) % 24).padStart(2, '0')}:00`;

const titleFor = (view: View): string =>
  view === WEEK
    ? 'The past week'
    : view === today()
      ? 'Today’s exposure'
      : view === yesterday()
        ? 'Yesterday’s exposure'
        : `Exposure on ${formatDate(view)}`;

/**
 * Your exposure: choose who it is for (a child at school, an adult at work, a senior at home), then the
 * past week, yesterday or today, or any date. Three or four places at most, and a monitor or unit
 * near any of them is picked up automatically.
 */
export function ExposureScreen({
  search,
}: {
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
}): React.JSX.Element {
  const { household, person, select, add, remove } = useHousehold();
  const persona = personaOf(person);
  const { spots, set, clear } = useSpots(person);
  const [adding, setAdding] = useState(false);
  const [panel, setPanel] = useState(false);
  const [logging, setLogging] = useState(false);
  const { outings, add: addOuting, remove: removeOuting } = useOutings(person);
  const { devices } = useDevices();
  const { pins, add: addPin } = usePins();
  const live = useLive();
  const [view, setView] = useState<View>(today());
  // A link from elsewhere (the assistant, after logging an outing) can open a person, a tab and an hour.
  const [params] = useSearchParams();
  const wantedTab = params.get('tab');
  const wantedHour = Number(params.get('hour'));
  const [tab, setTab] = useState<Tab>(
    wantedTab === 'outdoor' || wantedTab === 'home' || wantedTab === 'work' ? wantedTab : 'all',
  );
  // The hour shown starts at the latest one so far today, not noon, so what was just logged is what you see.
  const [picked, setPicked] = useState(() =>
    params.has('hour') && Number.isInteger(wantedHour) && wantedHour >= 0 && wantedHour < 24
      ? wantedHour
      : Math.max(0, hoursSoFar(today()) - 1),
  );
  const wantedPerson = params.get('person');
  useEffect(() => {
    if (wantedPerson !== null && household.people.some((p) => p.id === wantedPerson))
      select(wantedPerson);
    // Once, when the link is followed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedPerson]);
  const [showInfo, setShowInfo] = useState(false);

  const info = personaById(persona);
  const visible = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(spots).filter(([kind]) => info.kinds.some((k) => k === kind)),
      ),
    [spots, info],
  );
  const units = useMemo(
    () =>
      allUnits(devices, [
        spots,
        ...loadAllSpots(
          window.localStorage,
          household.people.map((p) => ({ id: p.id, persona: personaOf(p) })),
        ),
      ]),
    [devices, spots, household.people],
  );
  const rings: readonly Where[] = [...info.kinds, 'live'];
  const date = view === WEEK ? today() : view;
  const shownTab: Tab = tab !== 'all' && !info.kinds.some((k) => k === tab) ? 'all' : tab;

  // The air at every place this person's day touches: where they are set, where they went outside, and where
  // their location put them. It loads, and the dial fills in as it arrives.
  const needed = useMemo(() => {
    const pinsHere: Pin[] = [
      ...Object.values(visible).map((spot) => spot.pin),
      ...outings.map((o) => o.pin),
      ...Object.values(live.log).map((fix) => ({
        id: pinId(fix.lat, fix.lng),
        name: 'Here',
        lat: fix.lat,
        lng: fix.lng,
      })),
    ];
    return [...new Map(pinsHere.map((p) => [p.id, p])).values()];
  }, [visible, outings, live.log]);
  const history = useHistory(needed);
  const cells = useMemo(
    () => dayCells(visible, units, live.log, date, outings),
    // `history` is here so the day is worked out again when the air arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, units, live.log, date, outings, history],
  );
  const shown = shownTab === 'all' ? cells : cells.filter((cell) => cell.where === shownTab);
  const counted = shownTab === 'all' ? countedCells(cells) : shown;
  const summary = summarise(counted, openAirFor(counted, visible, live.log, date));
  const week = useMemo(
    () => lastWeek().map((d) => ({ date: d, summary: daySummary(visible, units, {}, d, outings) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, units, outings, history],
  );
  const setKinds = new Set<Where>(info.kinds.filter((kind) => visible[kind] !== undefined));
  if (Object.keys(live.log).length > 0) setKinds.add('live');
  if (cells.some((cell) => cell.where === 'outdoor')) setKinds.add('outdoor');
  const atPicked = shown.filter((cell) => cell.hour === picked);
  const isToday = date === today();
  const span =
    summary?.fullDay === false ? `so far today (${String(summary.hours)} hours)` : 'over the day';
  const noData = view !== 'week' && !hasData(view);

  const open = (next: View): void => {
    setView(next);
    setPicked(next === today() ? Math.max(0, hoursSoFar(today()) - 1) : 12);
  };
  const choosePerson = (id: string): void => {
    select(id);
    setTab('all');
    setPanel(true);
  };
  const isMe = person.id === 'me';
  const autoOn = live.state === 'on' || live.state === 'asking' || live.sample;

  return (
    <div className="page places">
      <header className="place">
        <div className="title-row">
          <h1>{titleFor(view)}</h1>
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
            <p className="muted small">{sourcesNote()}</p>
          </div>
        )}

        <div className="exposure-progress">
          <Progress />
        </div>
        <div className="people-row" role="group" aria-label="Who is this for">
          {household.people.map((p) => (
            <button
              key={p.id}
              type="button"
              className="person"
              aria-pressed={person.id === p.id}
              onClick={() => {
                choosePerson(p.id);
              }}
            >
              <span className="avatar" aria-hidden="true">
                {initials(p.name)}
              </span>
              <span className="person-words">
                <strong>{p.name}</strong>
                <span className="muted small">
                  {p.age}, {DAY_LABELS[p.day].toLowerCase()}
                </span>
              </span>
            </button>
          ))}
          {household.people.length < MAX_PEOPLE && (
            <button
              type="button"
              className="person add"
              onClick={() => {
                setAdding(true);
              }}
            >
              <span className="avatar" aria-hidden="true">
                <Plus size={18} strokeWidth={2.25} />
              </span>
              <span className="person-words">
                <strong>Add person</strong>
                <span className="muted small">Track someone</span>
              </span>
            </button>
          )}
        </div>
        {isMe && (
          <label className="auto-switch">
            <LocateFixed size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>
              <strong>Work it out from where I am</strong>
              <span className="muted small">
                {autoOn
                  ? 'On. Using your location while this page is open.'
                  : 'Off. Turn on to count the hours from your location.'}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={autoOn}
              onChange={(event) => {
                if (event.target.checked) live.start();
                else {
                  live.stop();
                  live.clearLog();
                }
              }}
            />
          </label>
        )}

        <div className="segmented wide" role="group" aria-label="Span">
          <button
            type="button"
            aria-pressed={view === WEEK}
            onClick={() => {
              open(WEEK);
            }}
          >
            Past week
          </button>
          <button
            type="button"
            aria-pressed={view === yesterday()}
            onClick={() => {
              open(yesterday());
            }}
          >
            Yesterday
          </button>
          <button
            type="button"
            aria-pressed={view === today()}
            onClick={() => {
              open(today());
            }}
          >
            Today
          </button>
        </div>
        <label className="date-pick">
          <CalendarDays size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>Another date</span>
          <input
            type="date"
            value={view === WEEK ? '' : view}
            onChange={(event) => {
              if (event.target.value !== '') open(event.target.value);
            }}
          />
        </label>
      </header>

      <main className="exposure-main">
        {history === 'loading' && needed.length > 0 && (
          <AirLoading what="the last two weeks of air for these places" />
        )}
        {history === 'error' && (
          <AirError
            message="Without it we cannot work out the hours."
            onRetry={() => {
              for (const pin of needed) airStore().ensureHistory(pin, true);
            }}
          />
        )}
        {noData && (
          <p className="banner" role="status">
            No data for {formatDate(view)}. We only keep the last two weeks.
          </p>
        )}

        {view === WEEK && <WeekStrip days={week} onOpen={open} />}

        {view !== 'week' && !noData && (
          <>
            <div className="segmented wide kinds" role="group" aria-label="Show">
              {(['all', ...info.kinds] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={shownTab === t}
                  onClick={() => {
                    setTab(t);
                  }}
                >
                  {t === 'all' ? 'All' : SPOT_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="dial-wrap">
              <Dial
                cells={cells}
                rings={rings}
                focus={shownTab}
                nowHour={isToday ? hoursSoFar(today()) + 0.5 : undefined}
                picked={picked}
                onPick={setPicked}
                set={setKinds}
              />
            </div>
            <DialKey rings={rings} focus={shownTab} />
            <div className="hour-row">
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
              <button
                type="button"
                className="dial-log"
                aria-label={isMe ? 'Log outdoor time' : `Log outdoor time for ${person.name}`}
                onClick={() => {
                  setLogging(true);
                }}
              >
                <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
                <span>
                  Log outdoor
                  <br />
                  time
                </span>
              </button>
            </div>
            <div className="readout" aria-live="polite">
              {atPicked.length === 0 ? (
                <p className="muted">
                  {isToday && picked >= hoursSoFar(today())
                    ? 'That hour has not happened yet.'
                    : shownTab === 'outdoor'
                      ? isMe
                        ? 'No outdoor time counted for this hour. It comes from your location.'
                        : `No outdoor time logged for this hour. Log it for ${person.name}.`
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
                        {levelForAqi(cell.aqi).name.toLowerCase()}. {cell.pm25} µg/m³ PM
                        <sub>2.5</sub>
                        {cell.source === 'assumed' || cell.source === 'trees' ? ' (assumed)' : ''}
                        {cell.source === 'unit' ? ' (from a nearby unit)' : ''}
                        <SmokeNote pm25={cell.pm25} className="readout-smoke" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Summary summary={summary} cells={counted} span={span} />
          </>
        )}
      </main>
      {panel && (
        <PersonPanel
          person={person}
          kinds={info.kinds}
          spots={spots}
          pins={pins}
          units={units}
          isMe={isMe}
          live={{
            state: live.state,
            sample: live.sample,
            hours: Object.keys(live.log).length,
            start: live.start,
            stop: live.stop,
            showSample: live.showSample,
            clear: live.clearLog,
          }}
          canRemove={household.people.length > 1}
          outings={outings}
          onLog={() => {
            setLogging(true);
          }}
          onRemoveOuting={removeOuting}
          onSet={set}
          onClear={clear}
          onAddPin={addPin}
          onRemove={() => {
            remove(person.id);
            setPanel(false);
          }}
          onClose={() => {
            setPanel(false);
          }}
          {...(search !== undefined ? { search } : {})}
        />
      )}
      {logging && (
        <OutingSheet
          person={person}
          pins={pins}
          onClose={() => {
            setLogging(false);
          }}
          onSave={(details) => {
            addOuting(details);
            setLogging(false);
            setTab('outdoor');
            setView(details.date);
            setPicked(Math.floor(details.start / 60));
          }}
        />
      )}
      {adding && (
        <AddPerson
          pins={pins}
          onAddPin={addPin}
          {...(search !== undefined ? { search } : {})}
          onClose={() => {
            setAdding(false);
          }}
          onAdd={(details, newSpots) => {
            const id = add(details);
            saveSpots(window.localStorage, id, newSpots);
            setTab('all');
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
