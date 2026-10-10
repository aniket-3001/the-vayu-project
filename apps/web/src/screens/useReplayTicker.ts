import { useEffect, useRef, useState } from 'react';
import {
  initialReplayState,
  pause as pauseState,
  play as playState,
  reset as resetState,
  setSpeed as setSpeedState,
  tick,
  type ReplayState,
} from '../model/replayState';

export interface ReplayControls {
  readonly state: ReplayState;
  readonly play: () => void;
  readonly pause: () => void;
  readonly setSpeed: (speed: number) => void;
  readonly reset: () => void;
}

/** Drives `replayState`'s pure tick() from real elapsed time, one requestAnimationFrame at a time. */
export function useReplayTicker(
  startAt: string,
  endAt: string,
  initialSpeed: number,
): ReplayControls {
  const [state, setState] = useState<ReplayState>(() =>
    initialReplayState(startAt, endAt, initialSpeed),
  );
  const lastFrameMs = useRef<number | null>(null);

  useEffect(() => {
    setState(initialReplayState(startAt, endAt, initialSpeed));
  }, [startAt, endAt, initialSpeed]);

  useEffect(() => {
    if (!state.playing) {
      lastFrameMs.current = null;
      return;
    }
    let frame: number;
    const step = (now: number): void => {
      const last = lastFrameMs.current ?? now;
      lastFrameMs.current = now;
      setState((prev) => tick(prev, now - last));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      lastFrameMs.current = null;
    };
  }, [state.playing]);

  return {
    state,
    play: () => {
      setState(playState);
    },
    pause: () => {
      setState(pauseState);
    },
    setSpeed: (speed: number) => {
      setState((prev) => setSpeedState(prev, speed));
    },
    reset: () => {
      setState(resetState);
    },
  };
}
