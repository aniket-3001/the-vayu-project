import { airStore } from '../air/store';
import type { Device } from '../devices/devices';
import { AT_PLACE_KM, distanceKm } from './geo';
import { DEFAULT_HOURS, type Spots } from './spots';
import type { Pin } from '../data/pins';

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
  /** True for a real unit measured over Bluetooth, whose hours are counted from what it measured. */
  readonly measured?: boolean;
  /** The device the unit's readings are kept under, for a real unit. */
  readonly deviceId?: string;
}

/** The units the person added, placed where that kind of place is set, for any kind of person. */
export function ownUnits(devices: readonly Device[], allSpots: readonly Spots[]): readonly Unit[] {
  const units = new Map<string, Unit>();
  for (const device of devices) {
    for (const spots of allSpots) {
      const spot = spots[device.where];
      if (spot === undefined) continue;
      const id = `${device.id}@${spot.pin.id}`;
      units.set(id, {
        id,
        name: device.name,
        lat: spot.pin.lat,
        lng: spot.pin.lng,
        own: true,
        ...(device.measured === true ? { measured: true, deviceId: device.id } : {}),
      });
    }
  }
  return [...units.values()];
}

/**
 * Every unit that can help: the person's own first, then the shared ones. The Vayu monitor is not built, so in the
 * deployed app only the person's own measured units count, and every other indoor hour is the labelled assumption;
 * only the tests have made-up units.
 */
export const allUnits = (
  devices: readonly Device[],
  allSpots: readonly Spots[],
): readonly Unit[] => {
  const made = airStore().madeUpExposure();
  const own = ownUnits(devices, allSpots);
  // In the deployed app only real, measured units count: a sample device is never counted as a reading.
  return made === undefined ? own.filter((u) => u.measured === true) : [...own, ...made.units];
};

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

/** The id prefix of a place that is only a measuring unit's room: it has no address, so there is no outside air for it. */
export const ROOM_PIN_PREFIX = 'room:';

/** Whether a place is just a unit's room, with no address. */
export const isRoomPin = (pin: Pin): boolean => pin.id.startsWith(ROOM_PIN_PREFIX);

/**
 * The places of a person's day with a room added for each real unit that has none: a unit connected for Home, when
 * no home address was set, is still the home the day is spent in. The room has no coordinates, so nothing outside is
 * looked up for it, and only the hours the unit measured count. A place the person did set always wins, and then the
 * unit's readings take the place of the outside reading at that address.
 */
export function withRooms(spots: Spots, devices: readonly Device[]): Spots {
  const out: { -readonly [K in keyof Spots]: Spots[K] } = { ...spots };
  for (const device of devices) {
    if (device.measured !== true || device.where === 'outdoor' || out[device.where] !== undefined)
      continue;
    const hours = DEFAULT_HOURS[device.where];
    out[device.where] = {
      pin: { id: `${ROOM_PIN_PREFIX}${device.id}`, name: 'Your room', lat: 0, lng: 0 },
      from: hours.from,
      to: hours.to,
    };
  }
  return out;
}
