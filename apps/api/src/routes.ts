import { DEMO_PLACES, type Mode } from '@vayu/contracts';
import type { Clock } from '@vayu/core';
import {
  countFires,
  NORTH_INDIA_BOX,
  type FireDetection,
  type FireRepo,
  type ForecastRepo,
  type GasRepo,
  type ModelHistoryRepo,
  type ReplayRepo,
  type StationRepo,
  type WindGridRepo,
  type AirGridRepo,
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
import { handleAccount, type AccountDeps } from './accountRoute';
import { handleFixChecks, type FixChecksDeps } from './fixChecksRoute';
import { handleReplay } from './replayRoute';
import type { CacheReader } from './roomStores';
import { handleRoom, type RoomsDeps } from './roomsRoute';
import { loadAir, placeFromQuery } from './air';
import { handleHistory } from './historyRoute';
import { handleAssistant, type AssistantDeps } from './assistantRoute';
import { handleFireReports, type FireReportsDeps } from './fireReportsRoute';
import { handleRequests, type RequestsDeps } from './requestsRoute';
import { handleSpeech, type SpeechDeps } from './speechRoute';
import { handleStations } from './stationsRoute';
import { handleAirGrid } from './airGridRoute';
import { handleWind } from './windRoute';
import { handleToday } from './todayRoute';
import { failure, ok, okCached, type ApiRequest, type ApiResponse } from './respond';
export type { ApiRequest, ApiResponse } from './respond';
import { timelineFor } from './timeline';

const MAX_FIRE_POINTS = 400;

/** The fires of the last 24 hours that are not the faintest, as small records, the fiercest first, at most 400. */
function recentFires(
  detections: readonly FireDetection[],
  asOf: string,
): readonly { lat: number; lng: number; at: string; frp: number | null }[] {
  const now = Date.parse(asOf);
  return detections
    .filter(
      (d) =>
        d.confidence !== 'low' &&
        now - Date.parse(d.detectedAt) >= 0 &&
        now - Date.parse(d.detectedAt) <= 24 * 3_600_000,
    )
    .sort((a, b) => (b.frp ?? 0) - (a.frp ?? 0))
    .slice(0, MAX_FIRE_POINTS)
    .map((d) => ({
      lat: Math.round(d.lat * 1000) / 1000,
      lng: Math.round(d.lng * 1000) / 1000,
      at: d.detectedAt,
      frp: d.frp,
    }));
}

export interface RouterDeps {
  /** Saved places and settings for a signed-in person. Absent where no accounts are wired: /v1/me is then not found. */
  readonly account?: AccountDeps | undefined;
  /** The sign-in service's public ids, for the app to start from. Absent: accounts are off and the app needs no sign-in. */
  readonly authConfig?:
    { readonly userPoolId: string; readonly clientId: string; readonly region: string } | undefined;
  /** The assistant behind Bedrock. Absent where nothing is wired: /v1/assistant is then not found. */
  readonly assistant?: AssistantDeps | undefined;
  /** Asking for a demo or monitors. Absent where nothing is wired: /v1/requests is then not found. */
  readonly requests?: RequestsDeps | undefined;
  /** Reporting a fire. Absent where nothing is wired: /v1/fire-reports is then not found. */
  readonly fireReports?: FireReportsDeps | undefined;
  /** Reading an answer aloud. Absent where nothing is wired: /v1/speech is then not found. */
  readonly speech?: SpeechDeps | undefined;
  /** The Today screen's weather and gases. Absent, or failing, only means Today has none. */
  readonly weatherForecastRepo?: WeatherForecastRepo | undefined;
  readonly gasRepo?: GasRepo | undefined;
  /** The regional model for the days just gone, for history where no monitor has a recent reading. */
  readonly historyRepo?: ModelHistoryRepo | undefined;
  /** The wind across the map. Absent where nothing is wired: /v1/wind is then not found. */
  readonly windRepo?: WindGridRepo | undefined;
  /** The air model across the map, for where no monitor reports. Absent: /v1/airgrid is then not found. */
  readonly airGridRepo?: AirGridRepo | undefined;
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
    if (request.path === '/v1/me') {
      return deps.account === undefined
        ? failure(404, 'not_found', `No route for ${request.path}`)
        : handleAccount(request, deps.account);
    }
    if (request.path === '/v1/auth-config') {
      // Public, and the same for everyone: which sign-in service the app should use, or that there is none.
      return okCached(
        deps.authConfig === undefined ? { enabled: false } : { enabled: true, ...deps.authConfig },
        300,
      );
    }
    if (request.path === '/v1/assistant') {
      return deps.assistant === undefined
        ? failure(404, 'not_found', `No route for ${request.path}`)
        : handleAssistant(request, deps.assistant);
    }
    if (request.path === '/v1/speech') {
      return deps.speech === undefined
        ? failure(404, 'not_found', 'The voice is not available here')
        : handleSpeech(request, deps.speech);
    }
    if (request.path === '/v1/requests') {
      return deps.requests === undefined
        ? failure(404, 'not_found', `No route for ${request.path}`)
        : handleRequests(request, deps.requests);
    }
    if (request.path === '/v1/fire-reports') {
      return deps.fireReports === undefined
        ? failure(404, 'not_found', `No route for ${request.path}`)
        : handleFireReports(request, deps.fireReports);
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
      case '/v1/stations':
        return deps.cache === undefined
          ? failure(404, 'not_found', `No route for ${request.path}`)
          : handleStations(request, {
              stations: (asOf) => deps.cache?.stations?.(asOf) ?? Promise.resolve(undefined),
              clock: deps.clock,
            });
      case '/v1/wind':
        return deps.windRepo === undefined
          ? failure(404, 'not_found', `No route for ${request.path}`)
          : handleWind(request, { wind: deps.windRepo, clock: deps.clock });
      case '/v1/airgrid':
        return deps.airGridRepo === undefined
          ? failure(404, 'not_found', `No route for ${request.path}`)
          : handleAirGrid(request, { air: deps.airGridRepo, clock: deps.clock });
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
        return okCached(
          {
            asOf,
            region: 'Punjab, Haryana and Delhi (approximate box)',
            source: 'NASA FIRMS satellite fire detections',
            mode: deps.fireMode ?? deps.mode,
            counts: countFires(detections, asOf),
            // Where they were seen, so the map can show them: the last day, not the faintest, and no more than
            // four hundred. A position is a satellite's hot pixel, not a pollution reading.
            detections: recentFires(detections, asOf),
          },
          300,
        );
      }
      default:
        return failure(404, 'not_found', `No route for ${request.path}`);
    }
  };
}
