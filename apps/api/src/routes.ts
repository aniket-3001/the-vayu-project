import { DEMO_PLACES, type Mode, type Place } from '@vayu/contracts';
import type { Clock } from '@vayu/core';
import {
  countFires,
  NORTH_INDIA_BOX,
  fromHarvest,
  nearestFreshStation,
  type FireRepo,
  type ForecastRepo,
  type ReplayRepo,
  type StationRepo,
  type WeatherRepo,
} from '@vayu/data';
import {
  handleTelegramUpdate,
  isValidWebhookSecret,
  sendTelegramEffects,
  TelegramUpdateSchema,
  type AckRecord,
  type LinkStore,
} from '@vayu/watch';
import { handleFixChecks, type FixChecksDeps } from './fixChecksRoute';
import { handleReplay } from './replayRoute';
import type { CacheReader } from './roomStores';
import { handleRoom, type RoomsDeps } from './roomsRoute';
import { failure, ok, type ApiRequest, type ApiResponse } from './respond';
export type { ApiRequest, ApiResponse } from './respond';
import { findPlace, locationPlace, timelineFor } from './timeline';

export interface RouterDeps {
  readonly stationRepo: StationRepo;
  readonly forecastRepo: ForecastRepo;
  readonly fireRepo: FireRepo;
  /** Prepared real past weeks. Absent where none are wired: /v1/replay is then not found. */
  readonly replayRepo?: ReplayRepo | undefined;
  /** The unit's readings and the harvest's cache. Absent where no unit is wired: /v1/rooms is then not found. */
  readonly rooms?: RoomsDeps | undefined;
  /** Starts and reads "did it work?" runs. Absent where no workflow is wired: /v1/fixchecks is then not found. */
  readonly fixChecks?: FixChecksDeps | undefined;
  /** What the harvest cached. When present, demo places are answered from it while it is fresh. */
  readonly cache?: CacheReader | undefined;
  /** The weather model. Absent, or failing, only means the timeline has no weather. */
  readonly weatherRepo?: WeatherRepo | undefined;
  /** Mode of the fire data alone when it differs from `mode` (e.g. live fires, fixture stations). */
  readonly fireMode?: Mode;
  readonly clock: Clock;
  /** Honest about the repos behind it (rule I12): 'model' while fixture-backed, 'live' once real. */
  readonly mode: Mode;
  readonly linkStore: LinkStore;
  /** Resumes the alert loop that is waiting for a first-time button tap. Absent in tests and demos. */
  readonly onFirstAck?: (ack: AckRecord) => Promise<unknown>;
  readonly telegram: {
    readonly botToken: string;
    readonly webhookSecret: string;
    readonly fetchImpl?: typeof fetch;
  };
}

const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

async function handleTelegramWebhook(request: ApiRequest, deps: RouterDeps): Promise<ApiResponse> {
  if (request.method !== 'POST') {
    return failure(405, 'method_not_allowed', `${request.method} is not supported here`);
  }
  if (!isValidWebhookSecret(request.headers[TELEGRAM_SECRET_HEADER], deps.telegram.webhookSecret)) {
    return failure(401, 'invalid_secret', 'Invalid or missing webhook secret');
  }

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(request.body ?? '{}');
  } catch {
    return failure(400, 'invalid_body', 'Request body is not valid JSON');
  }
  const parsed = TelegramUpdateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return failure(400, 'invalid_body', 'Could not parse the request body as a Telegram update');
  }

  const effects = await handleTelegramUpdate(parsed.data, {
    store: deps.linkStore,
    clock: deps.clock,
    ...(deps.onFirstAck === undefined ? {} : { onFirstAck: deps.onFirstAck }),
  });
  await sendTelegramEffects(effects, {
    botToken: deps.telegram.botToken,
    ...(deps.telegram.fetchImpl === undefined ? {} : { fetchImpl: deps.telegram.fetchImpl }),
  });
  return ok({ ok: true });
}

/**
 * The whole API as one pure-ish function of its injected dependencies: request in, response out.
 * Built at the edge (the Lambda handler); every dependency has a fixture implementation, so this
 * runs and is tested with no network and no AWS account.
 */
export function createRouter(deps: RouterDeps) {
  return async function route(request: ApiRequest): Promise<ApiResponse> {
    if (request.path === '/v1/watch/telegram/webhook') {
      return handleTelegramWebhook(request, deps);
    }
    if (request.path === '/v1/fixchecks' || request.path.startsWith('/v1/fixchecks/')) {
      return deps.fixChecks === undefined
        ? failure(404, 'not_found', `No route for ${request.path}`)
        : handleFixChecks(request, deps.fixChecks);
    }
    if (request.method !== 'GET') {
      return failure(405, 'method_not_allowed', `${request.method} is not supported here`);
    }
    if (request.path.startsWith('/v1/rooms/')) {
      return deps.rooms === undefined
        ? failure(404, 'not_found', `No route for ${request.path}`)
        : handleRoom(request, deps.rooms, deps.clock.now());
    }
    switch (request.path) {
      case '/v1/health':
        return ok({ status: 'ok', mode: deps.mode });
      case '/v1/places':
        return ok({ places: DEMO_PLACES });
      case '/v1/timeline': {
        const { lat, lng, place: placeId } = request.query;
        let place: Place | undefined;
        if (lat !== undefined || lng !== undefined) {
          place = locationPlace(lat, lng);
          if (place === undefined) {
            return failure(
              400,
              'bad_location',
              'lat and lng must both be numbers inside north India (roughly 20 to 35 N, 70 to 90 E)',
              'lat',
            );
          }
        } else {
          if (placeId === undefined) {
            return failure(
              400,
              'missing_parameter',
              'Add ?place=home (or school, office, park), or ?lat=..&lng=..',
              'place',
            );
          }
          place = findPlace(placeId);
          if (place === undefined) {
            return failure(
              404,
              'unknown_place',
              `No place called "${placeId}". Try one from /v1/places`,
              'place',
            );
          }
        }
        const asOf = deps.clock.now();
        // The four demo places are harvested every 15 minutes, so while that is fresh a request
        // never has to ask OpenAQ. Anything else (your own location), or a harvest that has gone
        // quiet, is looked up live. Only a station with a recent reading counts. With none we fall
        // back to the model estimate and say so (mode 'model') rather than show old numbers as current.
        const harvested =
          deps.cache !== undefined && findPlace(place.id) !== undefined
            ? fromHarvest(
                await deps.cache.latest(place.id, asOf),
                await deps.cache.latestForecast(place.id, asOf),
                asOf,
              )
            : undefined;
        const [fresh, forecast, weather] = await Promise.all([
          harvested?.station ?? nearestFreshStation(deps.stationRepo, place, asOf),
          harvested?.forecast ?? deps.forecastRepo.forecastFor(place, asOf),
          // Weather is context. If the model is down, the air answer still goes out without it.
          (deps.weatherRepo?.nowAt(place, asOf) ?? Promise.resolve(undefined)).catch(
            () => undefined,
          ),
        ]);

        return ok(
          timelineFor({
            place,
            asOf,
            observed: fresh?.observed ?? [],
            forecast,
            nearest: fresh?.nearest,
            mode: fresh === undefined ? 'model' : deps.mode,
            weather,
            ...(fresh !== undefined && fresh === harvested?.station
              ? { fetchedAt: harvested.fetchedAt }
              : {}),
          }),
        );
      }
      case '/v1/replay':
      case '/v1/replay/weeks':
        return deps.replayRepo === undefined
          ? failure(404, 'not_found', `No route for ${request.path}`)
          : handleReplay(request, deps.replayRepo);
      case '/v1/fires': {
        // Satellite fire detections, not a pollution reading: counts only, labelled as such.
        const asOf = deps.clock.now();
        const detections = await deps.fireRepo.firesIn(NORTH_INDIA_BOX, asOf);
        return ok({
          asOf,
          region: 'Punjab, Haryana and Delhi (approximate box)',
          source: 'NASA FIRMS satellite fire detections',
          mode: deps.fireMode ?? deps.mode,
          counts: countFires(detections, asOf),
        });
      }
      default:
        return failure(404, 'not_found', `No route for ${request.path}`);
    }
  };
}
