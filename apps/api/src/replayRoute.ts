import type { ReplayRepo } from '@vayu/data';
import { failure, ok, type ApiRequest, type ApiResponse } from './respond';
import { findPlace, timelineFor } from './timeline';

const missing = (param: string, hint: string): ApiResponse =>
  failure(400, 'missing_parameter', hint, param);

/**
 * `/v1/replay/weeks` lists the prepared weeks. `/v1/replay?week=&place=&asOf=` answers as if it
 * were `asOf`: the timeline core only ever sees hours that had ended by then (rule I1), and an
 * `asOf` outside the prepared week is refused instead of quietly clamped.
 */
export async function handleReplay(request: ApiRequest, repo: ReplayRepo): Promise<ApiResponse> {
  if (request.path === '/v1/replay/weeks') return ok({ weeks: await repo.weeks() });

  const { week: weekId, place: placeId, asOf } = request.query;
  if (weekId === undefined || weekId === '')
    return missing('week', 'Add ?week=W1 (see /v1/replay/weeks)');
  if (placeId === undefined || placeId === '')
    return missing('place', 'Add &place=home (or school, office, park)');
  if (asOf === undefined || asOf === '') return missing('asOf', 'Add &asOf=2025-12-10T12:00:00Z');
  const asOfMs = Date.parse(asOf);
  if (Number.isNaN(asOfMs)) {
    return failure(
      400,
      'bad_parameter',
      'asOf must be a date and time like 2025-12-10T12:00:00Z',
      'asOf',
    );
  }

  const manifest = await repo.manifest(weekId);
  if (manifest === undefined) {
    return failure(
      404,
      'unknown_week',
      `No replay week called "${weekId}". Try one from /v1/replay/weeks`,
      'week',
    );
  }
  const place = findPlace(placeId);
  if (place === undefined) {
    return failure(
      404,
      'unknown_place',
      `No place called "${placeId}". Try one from /v1/places`,
      'place',
    );
  }
  if (asOfMs < Date.parse(manifest.start) || asOfMs > Date.parse(manifest.end)) {
    return failure(
      400,
      'outside_replay_window',
      `This week runs from ${manifest.start} to ${manifest.end}`,
      'asOf',
    );
  }
  const series = await repo.series(weekId, place.id);
  if (series === undefined) {
    return failure(
      404,
      'no_data_for_place',
      `No station had enough data near ${place.name} in this week`,
      'place',
    );
  }

  return ok(
    timelineFor({
      place,
      asOf: new Date(asOfMs).toISOString(),
      observed: series.hours,
      forecast: [],
      nearest: {
        station: { ...series.station, hasPm25: true },
        distanceKm: series.station.distanceKm,
      },
      mode: 'replay',
    }),
  );
}
