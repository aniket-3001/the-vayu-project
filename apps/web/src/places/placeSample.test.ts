import { describe, expect, it } from 'vitest';
import { DEMO_PLACES } from '../data/places';
import { pinId, type Pin } from '../data/pins';
import { levelForAqi } from '../design/levels';
import { readingForPin, sampleIdForPin } from './placeSample';

const pinFor = (id: string): Pin => {
  const place = DEMO_PLACES.find((p) => p.id === id);
  if (place === undefined) throw new Error(`no demo place ${id}`);
  return { id: pinId(place.lat, place.lng), name: place.name, lat: place.lat, lng: place.lng };
};

describe('made-up readings for pinned places', () => {
  it('gives the four starter places four different levels, so the list shows the range', () => {
    const levels = DEMO_PLACES.map((p) => levelForAqi(readingForPin(pinFor(p.id)).aqi).name);
    expect(new Set(levels).size).toBe(4);
  });

  it('makes the park the cleanest and home worse than the office', () => {
    const aqi = (id: string): number => readingForPin(pinFor(id)).aqi;
    expect(aqi('park')).toBeLessThan(aqi('office'));
    expect(aqi('office')).toBeLessThan(aqi('home'));
  });

  it('gives a searched place the same made-up day every time', () => {
    const pin: Pin = { id: '26.85,80.95', name: 'Lucknow', lat: 26.85, lng: 80.95 };
    expect(sampleIdForPin(pin)).toBe(sampleIdForPin({ ...pin }));
    expect(readingForPin(pin)).toEqual(readingForPin(pin));
  });

  it('wears the pin’s own name and falls back to Delhi NCR when it has no detail', () => {
    const home = readingForPin(pinFor('home'));
    expect(home.place).toEqual({ name: 'Home', region: 'Delhi NCR' });
    const searched = readingForPin({
      id: 'x',
      name: 'Jaipur',
      detail: 'Jaipur, Rajasthan',
      lat: 26.9,
      lng: 75.8,
    });
    expect(searched.place.region).toBe('Jaipur, Rajasthan');
  });

  it('can show a place on another made-up day', () => {
    expect(readingForPin(pinFor('home'), 'good').aqi).toBeLessThan(50);
  });
});
