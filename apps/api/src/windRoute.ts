import { WindGrid } from '@vayu/contracts';
import type { WindGridRepo } from '@vayu/data';
import type { Clock } from '@vayu/core';
import { failure, okCached, type ApiRequest, type ApiResponse } from './respond';

export interface WindDeps {
  readonly wind: WindGridRepo;
  readonly clock: Clock;
}

/** The wind moves slowly across a grid this coarse, so a shared cache may keep an answer half an hour. */
export const WIND_CACHE_SECONDS = 1800;

/**
 * `GET /v1/wind`: the wind across the map's grid now, for the wind picture on the map. It is asked of the weather model
 * once for everyone and kept, so the visitor's browser never asks the model (which limits what one address may ask
 * in a day). When the model cannot be reached there is no made-up wind: the answer is a 502 and the map says so.
 */
export async function handleWind(request: ApiRequest, deps: WindDeps): Promise<ApiResponse> {
  if (request.method !== 'GET')
    return failure(405, 'method_not_allowed', `${request.method} is not supported here`);
  try {
    const points = await deps.wind.grid();
    return okCached(
      WindGrid.parse({
        schemaVersion: 1,
        asOf: deps.clock.now(),
        source: 'Open-Meteo: ICON and GFS weather models, 10 m wind',
        points,
      }),
      WIND_CACHE_SECONDS,
    );
  } catch {
    return failure(502, 'wind_unavailable', 'The weather model could not be reached for the wind');
  }
}
