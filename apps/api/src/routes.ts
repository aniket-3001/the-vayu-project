import { DEMO_PLACES, type Mode } from '@vayu/contracts';
import type { Clock } from '@vayu/core';
import {
  countFires,
  NORTH_INDIA_BOX,
  type FireRepo,
  type ForecastRepo,
  type GasRepo,
  type ModelHistoryRepo,
  type ReplayRepo,
  type StationRepo,
  type WeatherForecastRepo,
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
import { loadAir, placeFromQuery } from './air';
import { handleHistory } from './historyRoute';
import { handleToday } from './todayRoute';
import { failure, ok, type ApiRequest, type ApiResponse } from './respond';
export type { ApiRequest, ApiResponse } from './respond';
import { timelineFor } from './timeline';

export interface RouterDeps {
  /** The Today screen's weather and gases. Absent, or failing, only means Today has none. */
  readonly weatherForecastRepo?: WeatherForecastRepo | undefined;
  readonly gasRepo?: GasRepo | undefined;
  /** The regional model for the days just gone, for history where no monitor has a recent reading. */
  readonly historyRepo?: ModelHistoryRepo | undefined;
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
        const choice = placeFromQuery(request.query);
        if (choice.kind === 'error') return choice.response;
        const { place } = choice;
        const asOf = deps.clock.now();
        const air = await loadAir(deps, place, asOf);
        return ok(
          timelineFor({
            place,
            asOf,
            observed: air.fresh?.observed ?? [],
            forecast: air.forecast,
            nearest: air.fresh?.nearest,
            mode: air.fresh === undefined ? 'model' : deps.mode,
            weather: air.weather,
            ...(air.fetchedAt === undefined ? {} : { fetchedAt: air.fetchedAt }),
          }),
        );
      }
      case '/v1/today':
        return handleToday(request, {
          ...deps,
          mode: deps.mode === 'live' ? 'live' : 'model',
        });
      case '/v1/history':
        return handleHistory(request, {
          ...deps,
          mode: deps.mode === 'live' ? 'live' : 'model',
        });
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
