import type { Device } from '../devices/devices';
import { DEMO_PLACES } from '@vayu/contracts';
import { AT_PLACE_KM, distanceKm } from './geo';
import type { Spots } from './spots';

/**
 * A Vayu unit somewhere. A unit helps everyone who is in that place, whoever owns it: a monitor at home
 * covers the whole household and visitors, and a unit at a school covers every child there, with nothing
 * for them to set up. For now the shared ones are made up.
 */
export interface Unit {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  /** True for a unit the person added themselves. */
  readonly own: boolean;
}

const place = (id: string): { lat: number; lng: number } => {
  const found = DEMO_PLACES.find((p) => p.id === id);
  return { lat: found?.lat ?? 28.6, lng: found?.lng ?? 77.2 };
};

/** Units in the world, which anyone standing near gets the benefit of. Made up for the prototype. */
export const SAMPLE_UNITS: readonly Unit[] = [
  { id: 'unit-school', name: 'Vayu unit at the school', ...place('school'), own: false },
  { id: 'unit-office', name: 'Vayu unit at the office', ...place('office'), own: false },
  {
    id: 'unit-friend',
    name: 'Vayu unit at a friend’s home',
    lat: 28.6139,
    lng: 77.209,
    own: false,
  },
];

/** The units the person added, placed where that kind of place is set, for any kind of person. */
export function ownUnits(devices: readonly Device[], allSpots: readonly Spots[]): readonly Unit[] {
  const units = new Map<string, Unit>();
  for (const device of devices) {
    for (const spots of allSpots) {
      const spot = spots[device.where];
      if (spot === undefined) continue;
      const id = `${device.id}@${spot.pin.id}`;
      units.set(id, { id, name: device.name, lat: spot.pin.lat, lng: spot.pin.lng, own: true });
    }
  }
  return [...units.values()];
}

/** Every unit that can help: the person's own first, then the shared ones. */
export const allUnits = (
  devices: readonly Device[],
  allSpots: readonly Spots[],
): readonly Unit[] => [...ownUnits(devices, allSpots), ...SAMPLE_UNITS];

/** The nearest unit within reach of a point, if any. */
export function unitNear(
  point: { readonly lat: number; readonly lng: number },
  units: readonly Unit[],
): Unit | undefined {
  let best: { unit: Unit; distance: number } | undefined;
  for (const unit of units) {
    const distance = distanceKm(point, unit);
    if (distance <= AT_PLACE_KM && (best === undefined || distance < best.distance))
      best = { unit, distance };
  }
  return best?.unit;
}
