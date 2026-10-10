export interface PlaceMatch {
  readonly name: string;
  readonly detail: string;
  readonly lat: number;
  readonly lng: number;
}

interface GeocodeResult {
  readonly name?: string;
  readonly admin1?: string;
  readonly admin2?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

/** The area our monitors and fire box cover; matches the API's own limit. */
const inCoverage = (lat: number, lng: number): boolean =>
  lat >= 20 && lat <= 35 && lng >= 70 && lng <= 90;

/**
 * Looks a place name up on Open-Meteo's free geocoding service (no key). Only what the person types
 * is sent. Results outside north India are dropped, because we have no monitors there.
 */
export async function searchPlaces(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly PlaceMatch[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text)}` +
    `&count=8&country_code=IN&language=en`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Place search failed: ${res.status}`);
  const body = (await res.json()) as { results?: readonly GeocodeResult[] };
  const matches: PlaceMatch[] = [];
  for (const result of body.results ?? []) {
    const { name, latitude, longitude } = result;
    if (name === undefined || latitude === undefined || longitude === undefined) continue;
    if (!inCoverage(latitude, longitude)) continue;
    const detail = [result.admin2, result.admin1]
      .filter((part): part is string => part !== undefined && part !== '')
      .join(', ');
    matches.push({ name, detail, lat: latitude, lng: longitude });
  }
  return matches.slice(0, 6);
}
