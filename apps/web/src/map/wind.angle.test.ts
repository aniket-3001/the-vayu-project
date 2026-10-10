import { describe, expect, it } from 'vitest';
import { angleBetween } from './WindCanvas';

describe('angleBetween', () => {
  it('is zero for the same point, 90 a quarter of the way round, 180 opposite', () => {
    expect(angleBetween({ lat: 20, lng: 80 }, { lat: 20, lng: 80 })).toBeCloseTo(0);
    expect(angleBetween({ lat: 0, lng: 0 }, { lat: 0, lng: 90 })).toBeCloseTo(90);
    expect(angleBetween({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(180);
    expect(angleBetween({ lat: 90, lng: 0 }, { lat: -90, lng: 0 })).toBeCloseTo(180);
  });
});
