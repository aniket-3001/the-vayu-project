import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../App';
import { AirStore, setAirStore } from '../air/store';
import { setClock } from '../clock';
import { setStarterPins } from '../data/pins';
import { setOwnerStartsWithSamples } from '../exposure/spots';
import { setWeekScene } from './active';
import { recordedSource } from './recordedSource';
import { sceneFor } from './scene';
import { WEEK_PINS, installMemoryStorage } from './storage';
import type { Recorded } from './types';
import { WeekBar } from './WeekBar';

/** How long a day stays on screen while the week plays itself. */
const PLAY_MS = 9000;
/** The height of the strip the app is moved down by, for screens that fill the window. */
const BAR_PX = 84;

/** Points the app at one recorded day: its clock, its air, its fires and its wind. */
function showDay(recorded: Recorded, index: number): void {
  const day = recorded.days[index];
  if (day === undefined) return;
  setClock(() => day.asOf);
  setAirStore(new AirStore(recordedSource(recorded, day)));
  setWeekScene(sceneFor(day));
}

function WeekApp({ recorded }: { readonly recorded: Recorded }): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shown, setShown] = useState(0);
  const first = useRef(true);
  if (first.current) {
    first.current = false;
    showDay(recorded, 0);
  }
  const select = useCallback(
    (next: number) => {
      const bounded = Math.max(0, Math.min(recorded.days.length - 1, next));
      showDay(recorded, bounded);
      setIndex(bounded);
      // The app below is built again for the new day, so no screen keeps the last day's numbers.
      setShown((n) => n + 1);
    },
    [recorded],
  );
  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      select(index + 1 >= recorded.days.length ? 0 : index + 1);
    }, PLAY_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [playing, index, recorded, select]);
  useEffect(() => {
    document.documentElement.style.setProperty('--bar-h', `${String(BAR_PX)}px`);
  }, []);
  return (
    <>
      <WeekBar
        recorded={recorded}
        index={index}
        playing={playing}
        onSelect={(i) => {
          setPlaying(false);
          select(i);
        }}
        onPlay={setPlaying}
        onLeave={() => {
          window.location.hash = '#/';
          window.location.reload();
        }}
      />
      <App key={shown} />
    </>
  );
}

/**
 * The recorded week: the app, unchanged, run on seven real days from the archive instead of on the air of this minute.
 * Opened by `#/week`. It is read-only and private: its places and people live in memory, and nothing it does is sent.
 */
export async function startWeek(root: HTMLElement): Promise<void> {
  const recorded = (await import('./recorded.json')).default as unknown as Recorded;
  installMemoryStorage();
  setStarterPins(WEEK_PINS);
  setOwnerStartsWithSamples(true);
  createRoot(root).render(<WeekApp recorded={recorded} />);
}
