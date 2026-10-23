import { describe, expect, it, vi } from 'vitest';
import { searchPlaces } from './geocode';

const json = (body: unknown, ok = true): Response =>
  ({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) }) as Response;
/** Answers each service by its address. */
const services = (answers: { photon?: Response; meteo?: Response }): typeof fetch =>
  vi.fn((url: string) => {
    const answer = url.includes('photon') ? answers.photon : answers.meteo;
    return answer === undefined ? Promise.reject(new Error('down')) : Promise.resolve(answer);
  }) as unknown as typeof fetch;

const school = {
  geometry: { coordinates: [77.048266, 28.4086214] },
  properties: {
    name: 'DAV Public School',
    street: "S Block Uppal's Southend",
    district: 'Sector 49',
    city: 'Gurugram',
    state: 'Haryana',
    countrycode: 'IN',
  },
};

describe('searchPlaces', () => {
  it('finds a school by name, which a town list cannot', async () => {
    const results = await searchPlaces(
      'DAV Sector 49 Gurgaon',
      services({ photon: json({ features: [school] }) }),
    );
    expect(results).toEqual([
      {
        name: 'DAV Public School',
        // "Sector 49" is in the street already, so it is not said twice.
        detail: "S Block Uppal's Southend, Sector 49, Gurugram, Haryana",
        lat: 28.4086214,
        lng: 77.048266,
      },
    ]);
  });

  it('drops anything outside north India or outside India', async () => {
    const abroad = { ...school, properties: { ...school.properties, countrycode: 'PK' } };
    const far = { ...school, geometry: { coordinates: [68.97, 22.24] } };
    expect(
      await searchPlaces(
        'x school',
        services({ photon: json({ features: [abroad, far] }), meteo: json({ results: [] }) }),
      ),
    ).toEqual([]);
  });

  it('favours Delhi, asks for no more than twelve, and never sends a search shorter than two letters', async () => {
    const fetchImpl = services({ photon: json({ features: [school] }) });
    expect(await searchPlaces(' D ', fetchImpl)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    await searchPlaces('Okhla', fetchImpl);
    const url = (vi.mocked(fetchImpl).mock.calls[0] as unknown as [string])[0];
    expect(url).toContain('q=Okhla');
    expect(url).toContain('limit=12');
    expect(url).toContain('lat=28.61');
  });

  it('falls back to Open-Meteo when Photon finds nothing or cannot be reached', async () => {
    const meteo = json({
      results: [
        {
          name: 'Dwarka',
          admin1: 'Delhi',
          admin2: 'South West',
          latitude: 28.59,
          longitude: 77.05,
        },
      ],
    });
    const expected = [{ name: 'Dwarka', detail: 'South West, Delhi', lat: 28.59, lng: 77.05 }];
    expect(
      await searchPlaces('Dwarka', services({ photon: json({ features: [] }), meteo })),
    ).toEqual(expected);
    expect(await searchPlaces('Dwarka', services({ meteo }))).toEqual(expected);
  });

  it('gives an empty list when nothing matches, and throws when both services are down', async () => {
    expect(
      await searchPlaces('Nowhereville', services({ photon: json({}), meteo: json({}) })),
    ).toEqual([]);
    await expect(searchPlaces('Dwarka', services({}))).rejects.toThrow();
  });
});

describe('searchPlaces by short name', () => {
  const place = (name: string, lng: number): unknown => ({
    geometry: { coordinates: [lng, 28.54] },
    properties: { name, countrycode: 'IN', city: 'New Delhi' },
  });
  it('finds IIIT-Delhi from the long name, and keeps the long name results too', async () => {
    const fetchImpl = vi.fn((url: string) => {
      const features = url.includes('q=IIITD')
        ? [place('IIIT-Delhi', 77.27), place('IIIT Delhi Library', 77.272), place('Unrelated', 77.3)]
        : [place('Indraprastha Institute of Science and Technology', 77.26)];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ features }) });
    }) as unknown as typeof fetch;
    const results = await searchPlaces(
      'Indraprastha Institute of Information Technology Delhi',
      fetchImpl,
    );
    expect(results.map((r) => r.name)).toEqual([
      'IIIT-Delhi',
      'IIIT Delhi Library',
      'Indraprastha Institute of Science and Technology',
    ]);
  });
});
