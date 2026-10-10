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
export const inCoverage = (lat: number, lng: number): boolean =>
  lat >= 20 && lat <= 35 && lng >= 70 && lng <= 90;

/** Where results are favoured: Delhi, so "Sector 49" means the one near Gurugram and not one far away. */
const FAVOUR = { lat: 28.61, lng: 77.21 } as const;

interface PhotonFeature {
  readonly geometry?: { readonly coordinates?: readonly [number, number] };
  readonly properties?: {
    readonly name?: string;
    readonly street?: string;
    readonly district?: string;
    readonly locality?: string;
    readonly city?: string;
    readonly county?: string;
    readonly state?: string;
    readonly countrycode?: string;
  };
}

/** The parts that are there, in order, without repeating one that an earlier part already says. */
const joined = (parts: readonly (string | undefined)[]): string => {
  const kept: string[] = [];
  for (const part of parts) {
    if (part === undefined || part === '') continue;
    if (kept.some((earlier) => earlier.includes(part))) continue;
    kept.push(part);
  }
  return kept.join(', ');
};

/**
 * Photon, the OpenStreetMap search, which knows schools, offices, parks and streets, not just towns. Only what the
 * person types is sent, with Delhi as the place to favour.
 */
async function photonSearch(text: string, fetchImpl: typeof fetch): Promise<readonly PlaceMatch[]> {
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=12&lang=en` +
    `&lat=${String(FAVOUR.lat)}&lon=${String(FAVOUR.lng)}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Place search failed: ${String(res.status)}`);
  const body = (await res.json()) as { features?: readonly PhotonFeature[] };
  const matches: PlaceMatch[] = [];
  for (const feature of body.features ?? []) {
    const props = feature.properties;
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    if (props === undefined || lat === undefined || lng === undefined) continue;
    if (props.countrycode !== undefined && props.countrycode !== 'IN') continue;
    if (!inCoverage(lat, lng)) continue;
    const name = props.name ?? props.street;
    if (name === undefined || name === '') continue;
    matches.push({
      name,
      detail: joined([
        props.name === undefined ? undefined : props.street,
        props.locality ?? props.district,
        props.city ?? props.county,
        props.state,
      ]),
      lat,
      lng,
    });
  }
  return matches;
}

/** Open-Meteo's town list: a fallback when Photon cannot be reached or finds nothing. */
async function openMeteoSearch(
  text: string,
  fetchImpl: typeof fetch,
): Promise<readonly PlaceMatch[]> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text)}` +
    `&count=8&country_code=IN&language=en`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Place search failed: ${String(res.status)}`);
  const body = (await res.json()) as { results?: readonly GeocodeResult[] };
  const matches: PlaceMatch[] = [];
  for (const result of body.results ?? []) {
    const { name, latitude, longitude } = result;
    if (name === undefined || latitude === undefined || longitude === undefined) continue;
    if (!inCoverage(latitude, longitude)) continue;
    matches.push({
      name,
      detail: joined([result.admin2, result.admin1]),
      lat: latitude,
      lng: longitude,
    });
  }
  return matches;
}

/**
 * Looks a place up by name: schools, offices, parks and streets as well as towns. Results outside the area we
 * cover (north India) are dropped; inside it, any place gets the nearest monitor's reading or a regional estimate.
 */
export async function searchPlaces(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly PlaceMatch[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  let found: readonly PlaceMatch[] = [];
  let failure: unknown;
  try {
    found = await photonSearch(text, fetchImpl);
  } catch (error) {
    failure = error;
  }
  if (found.length === 0) {
    try {
      found = await openMeteoSearch(text, fetchImpl);
      failure = undefined;
    } catch (error) {
      failure ??= error;
    }
  }
  if (found.length === 0 && failure !== undefined) throw failure as Error;
  return found.slice(0, 6);
}
