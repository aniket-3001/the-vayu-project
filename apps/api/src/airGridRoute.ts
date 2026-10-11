import { AirGrid } from '@vayu/contracts';
import type { AirGridRepo } from '@vayu/data';
import type { Clock } from '@vayu/core';
import { failure, okCached, type ApiRequest, type ApiResponse } from './respond';

export interface AirGridDeps {
  readonly air: AirGridRepo;
  readonly clock: Clock;
}

/** The model moves slowly across a grid this coarse, so a shared cache may keep an answer half an hour. */
export const AIR_GRID_CACHE_SECONDS = 1800;

/**
 * `GET /v1/airgrid`: the regional air model's PM2.5 across the globe now, for colouring the map where no monitor has a
 * recent reading. It is marked `model` and says what it is; the map labels it an estimate and never draws it as a
 * monitor. When the model cannot be reached the answer is a 502, not a guess.
 */
export async function handleAirGrid(request: ApiRequest, deps: AirGridDeps): Promise<ApiResponse> {
  if (request.method !== 'GET')
    return failure(405, 'method_not_allowed', `${request.method} is not supported here`);
  try {
    const points = await deps.air.grid();
    return okCached(
      AirGrid.parse({
        schemaVersion: 1,
        asOf: deps.clock.now(),
        mode: 'model',
        source: 'Open-Meteo CAMS regional air-quality model, PM2.5: an estimate, not a measurement',
        points,
      }),
      AIR_GRID_CACHE_SECONDS,
    );
  } catch {
    return failure(502, 'air_unavailable', 'The air model could not be reached');
  }
}
