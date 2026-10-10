import { useEffect, useState } from 'react';
import type { ReplaySource } from '../data/ReplaySource';
import { REPLAY_WEEKS, type ReplayWeek } from '../data/replayWeeks';

export type ReplayWeekState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly week: ReplayWeek;
      /** Why the sample week is showing instead of a real one, if it is. */
      readonly fallback?: 'unavailable' | 'none_prepared';
    };

/**
 * Loads the week to replay. If the real week cannot be had, the sample week is shown and the
 * screen says why: a fallback is never allowed to pass as the real thing.
 */
export function useReplayWeek(source: ReplaySource): ReplayWeekState {
  const [state, setState] = useState<ReplayWeekState>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    const sample = REPLAY_WEEKS[0];
    const fall = (fallback: 'unavailable' | 'none_prepared'): void => {
      if (current && sample !== undefined) setState({ status: 'ready', week: sample, fallback });
    };
    source.load().then(
      (week) => {
        if (!current) return;
        if (week === undefined) fall('none_prepared');
        else setState({ status: 'ready', week });
      },
      () => {
        fall('unavailable');
      },
    );
    return () => {
      current = false;
    };
  }, [source]);
  return state;
}
