import { describe, expect, it, vi } from 'vitest';
import { searchPlaces } from './geocode';

const respond = (body: unknown, ok = true): typeof fetch =>
  vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });

describe('searchPlaces', () => {
  it('returns named places with a region, and drops anything outside north India', async () => {
    const results = await searchPlaces(
      'Dwarka',
      respond({
        results: [
          {
            name: 'Dwarka',
            admin1: 'Delhi',
            admin2: 'South West',
            latitude: 28.59,
            longitude: 77.05,
          },
          { name: 'Dwarka', admin1: 'Gujarat', latitude: 22.24, longitude: 68.97 },
        ],
      }),
    );
    expect(results).toEqual([
      { name: 'Dwarka', detail: 'South West, Delhi', lat: 28.59, lng: 77.05 },
    ]);
  });

  it('asks only for India and never sends a search shorter than two letters', async () => {
    const fetchImpl = respond({ results: [] });
    expect(await searchPlaces(' D ', fetchImpl)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    await searchPlaces('Okhla', fetchImpl);
    const url = vi.mocked(fetchImpl).mock.calls[0]?.[0] as string;
    expect(url).toContain('name=Okhla');
    expect(url).toContain('country_code=IN');
  });

  it('gives an empty list when nothing matches, and throws when the service is down', async () => {
    expect(await searchPlaces('Nowhereville', respond({}))).toEqual([]);
    await expect(searchPlaces('Dwarka', respond({}, false))).rejects.toThrow(/search/i);
  });
});
