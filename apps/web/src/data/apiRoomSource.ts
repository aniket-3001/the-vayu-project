import { RoomObservation } from '@vayu/contracts';
import type { RoomInput, RoomSource } from './RoomSource';

/**
 * The room as the deployed API knows it: the unit's last 30 minutes against the outdoor air the
 * harvest recorded. The verdict is still worked out here with the shared core, so a unit and a
 * sample room are judged by exactly the same rules.
 */
export function apiRoomSource(baseUrl: string, fetchImpl: typeof fetch = fetch): RoomSource {
  const root = baseUrl.replace(/\/$/, '');
  return {
    async load(roomId: string): Promise<RoomInput> {
      const res = await fetchImpl(`${root}/v1/rooms/${encodeURIComponent(roomId)}`);
      if (!res.ok) throw new Error(`Room request failed: ${res.status}`);
      return RoomObservation.parse(await res.json());
    },
  };
}
