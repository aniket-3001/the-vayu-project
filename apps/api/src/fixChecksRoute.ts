import { z } from 'zod';
import type { FixCheckStore, StartOutcome } from './fixCheck';
import { failure, ok, type ApiRequest, type ApiResponse } from './respond';
import { findPlace } from './timeline';

export interface FixChecksDeps {
  readonly store: FixCheckStore;
  readonly start: (input: {
    roomId: string;
    placeId: string;
    waitSeconds: number;
  }) => Promise<StartOutcome>;
}

const NAME = /^[A-Za-z0-9_-]{1,64}$/;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const DEFAULT_PLACE = 'school';
const DEFAULT_WAIT_SECONDS = 300;

const Body = z.object({
  roomId: z.string().optional(),
  place: z.string().optional(),
  waitSeconds: z.number().optional(),
});

async function start(request: ApiRequest, deps: FixChecksDeps): Promise<ApiResponse> {
  let raw: unknown;
  try {
    raw = JSON.parse(request.body ?? '{}');
  } catch {
    return failure(400, 'invalid_body', 'The request body is not valid JSON');
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success)
    return failure(400, 'invalid_body', 'The request body is not what we expect');
  const {
    roomId,
    place: placeId = DEFAULT_PLACE,
    waitSeconds = DEFAULT_WAIT_SECONDS,
  } = parsed.data;
  if (roomId === undefined) {
    return failure(400, 'missing_parameter', 'Add "roomId": the name of the unit', 'roomId');
  }
  if (!NAME.test(roomId)) {
    return failure(400, 'bad_parameter', 'A room name is letters, digits, - and _ only', 'roomId');
  }
  if (findPlace(placeId) === undefined) {
    return failure(
      404,
      'unknown_place',
      `No place called "${placeId}". Try one from /v1/places`,
      'place',
    );
  }

  const outcome = await deps.start({ roomId, placeId, waitSeconds });
  if (outcome.kind === 'refused') {
    return outcome.code === 'room_not_reporting'
      ? failure(409, outcome.code, outcome.message)
      : failure(400, outcome.code, outcome.message, outcome.param);
  }
  return {
    statusCode: 202,
    body: {
      fixCheckId: outcome.fixCheckId,
      status: 'waiting',
      alreadyRunning: outcome.kind === 'exists',
    },
  };
}

/**
 * `POST /v1/fixchecks` starts a "did it work?" run for a room; `GET /v1/fixchecks/{id}` reads its
 * answer. Starting is guarded (the room must be reporting, the wait inside the rule, one run per room
 * per ten minutes), so the public endpoint cannot be used to start work for names that do not exist.
 */
export async function handleFixChecks(
  request: ApiRequest,
  deps: FixChecksDeps,
): Promise<ApiResponse> {
  if (request.path === '/v1/fixchecks') {
    return request.method === 'POST'
      ? start(request, deps)
      : failure(405, 'method_not_allowed', `${request.method} is not supported here`);
  }
  if (request.method !== 'GET') {
    return failure(405, 'method_not_allowed', `${request.method} is not supported here`);
  }
  const id = decodeURIComponent(request.path.slice('/v1/fixchecks/'.length));
  if (!ID.test(id)) {
    return failure(400, 'bad_parameter', 'That is not a FixCheck id', 'fixCheckId');
  }
  const found = await deps.store.get(id);
  return found === undefined
    ? failure(404, 'unknown_fixcheck', `No FixCheck called "${id}"`, 'fixCheckId')
    : ok(found);
}
