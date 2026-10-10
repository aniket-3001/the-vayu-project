import { useEffect, useState } from 'react';
import type { DataSource, Located } from '../data/DataSource';
import { buildTodayModel, type TodayModel } from '../model/todayModel';

/** Loading, ready or failed. There is no fourth state, so the screen cannot show a half-loaded mix. */
export type TodayState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly model: TodayModel }
  | { readonly status: 'failed'; readonly message: string };

export function useTodayModel(
  source: DataSource,
  placeId: string,
  sensitive: boolean,
  where?: Located,
): TodayState {
  const [state, setState] = useState<TodayState>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    source
      .load(placeId, where)
      .then((observations) => {
        if (current)
          setState({ status: 'ready', model: buildTodayModel(observations, { sensitive }) });
      })
      .catch((error: unknown) => {
        if (current) {
          setState({
            status: 'failed',
            message: error instanceof Error ? error.message : 'Something went wrong',
          });
        }
      });
    return () => {
      current = false;
    };
  }, [source, placeId, sensitive, where]);
  return state;
}
