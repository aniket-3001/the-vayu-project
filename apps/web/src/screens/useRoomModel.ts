import { useEffect, useState } from 'react';
import type { RoomSource } from '../data/RoomSource';
import { buildRoomModel, type RoomModel } from '../model/roomModel';

/** Loading, ready or failed. There is no fourth state, so the screen cannot show a half-loaded mix. */
export type RoomState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly model: RoomModel }
  | { readonly status: 'failed'; readonly message: string };

export function useRoomModel(source: RoomSource, roomId: string): RoomState {
  const [state, setState] = useState<RoomState>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    source
      .load(roomId)
      .then((input) => {
        if (current) setState({ status: 'ready', model: buildRoomModel(input) });
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
  }, [source, roomId]);
  return state;
}
