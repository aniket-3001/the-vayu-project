import { observeRoom, type RoomsDeps } from './observeRoom';
import { failure, ok, type ApiRequest, type ApiResponse } from './respond';
import { findPlace } from './timeline';

export type { RoomsDeps } from './observeRoom';

const THING_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** The place whose outdoor air a room is compared with, unless the caller names another. */
const DEFAULT_PLACE = 'school';

/**
 * `GET /v1/rooms/{id}?place=`: the unit's own readings from the last 30 minutes, set against the
 * outdoor air the harvest last recorded for a place. The app turns this into a verdict with the
 * shared core. Readings carry no personal data, but the id is not secret: do not put anything in a
 * unit name you would not put in a URL.
 */
export async function handleRoom(
  request: ApiRequest,
  deps: RoomsDeps,
  asOf: string,
): Promise<ApiResponse> {
  const roomId = decodeURIComponent(request.path.slice('/v1/rooms/'.length));
  if (!THING_ID.test(roomId)) {
    return failure(400, 'bad_parameter', 'A room name is letters, digits, - and _ only', 'roomId');
  }
  const placeId = request.query.place ?? DEFAULT_PLACE;
  const place = findPlace(placeId);
  if (place === undefined) {
    return failure(
      404,
      'unknown_place',
      `No place called "${placeId}". Try one from /v1/places`,
      'place',
    );
  }

  return ok(await observeRoom(roomId, place.id, asOf, deps));
}
