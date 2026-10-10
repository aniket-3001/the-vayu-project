import { describe, expect, it } from 'vitest';
import { bearingDeg, distanceKm, firesAffecting, type Fire } from './fires';

const fire = (id: string, lat: number, lng: number): Fire => ({
  id,
  lat,
  lng,
  frp: 10,
  hoursAgo: 3,
});
const DELHI = { lat: 28.61, lng: 77.2 };

describe('distance and bearing', () => {
  it('measures kilometres on the ground, and the compass direction', () => {
    expect(distanceKm(DELHI, DELHI)).toBe(0);
    // About 111 km for one degree of latitude.
    expect(distanceKm({ lat: 28, lng: 77 }, { lat: 29, lng: 77 })).toBeCloseTo(111, 0);
    expect(bearingDeg({ lat: 28, lng: 77 }, { lat: 29, lng: 77 })).toBeCloseTo(0, 0);
    expect(bearingDeg({ lat: 28, lng: 77 }, { lat: 28, lng: 78 })).toBeCloseTo(90, 0);
  });
});

describe('the fires that can reach a place', () => {
  const near = fire('near', 28.9, 77.1); // about 35 km
  const farOffWind = fire('amritsar', 31.63, 74.87); // about 400 km north-west
  const upwind = fire('karnal', 29.69, 76.99); // about 120 km north-west-ish
  const downwind = fire('agra', 27.18, 78.02); // about 190 km south-east
  const all = [near, farOffWind, upwind, downwind];

  it('keeps those within 100 km whatever the wind', () => {
    expect(firesAffecting(all, DELHI).map((f) => f.id)).toEqual(['near']);
  });

  it('adds those up to 300 km away on the side the wind comes from, and not those downwind or further', () => {
    // Wind from the north-north-west, which is where Karnal lies.
    const got = firesAffecting(all, DELHI, 350).map((f) => f.id);
    expect(got).toEqual(['near', 'karnal']);
    // Wind from the south-east: Agra is upwind now, Karnal is not.
    expect(firesAffecting(all, DELHI, 135).map((f) => f.id)).toEqual(['near', 'agra']);
  });

  it('counts none when none are close, however many there are far away', () => {
    const belt = Array.from({ length: 200 }, (_, i) =>
      fire(`f${String(i)}`, 31 + (i % 5) * 0.1, 75),
    );
    expect(firesAffecting(belt, DELHI, 315)).toEqual([]);
  });
});
