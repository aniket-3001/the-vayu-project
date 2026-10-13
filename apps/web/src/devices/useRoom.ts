import { usAqi } from '@vayu/core';
import { useToday } from '../air/store';
import { levelForAqi, type Level } from '../design/levels';
import type { Pin } from '../data/pins';
import { useHousehold, useSpots } from '../exposure/useExposure';
import { usePins } from '../places/usePins';
import type { TodayData } from '../today/types';
import type { Device } from './devices';
import { type UnitReading } from '@vayu/unit';
import { useDevices } from './useDevices';
import { useUnitState, type UnitState } from './useUnit';

/**
 * The air outside, at the place a measuring unit is in, to set beside what the room measures: the place the person set
 * for that kind of spot, or else their first saved place. `lower` is how much cleaner (or, negative, dirtier) the room
 * is than outside, in percent. Everything is undefined while there is nothing to compare with.
 */
export function useRoomComparison(
  device: Device | undefined,
  roomPm25: number | undefined,
): {
  readonly pin: Pin | undefined;
  readonly outside: TodayData | undefined;
  readonly status: 'none' | 'loading' | 'error' | 'ready';
  readonly lower: number | undefined;
} {
  const { person } = useHousehold();
  const { spots } = useSpots(person);
  const { pins } = usePins();
  const pin = device === undefined ? pins[0] : (spots[device.where]?.pin ?? pins[0]);
  const loaded = useToday(pin);
  const outside = loaded?.status === 'ready' ? loaded.data : undefined;
  const lower =
    roomPm25 !== undefined && outside !== undefined && outside.pm25 > 0
      ? Math.round((1 - roomPm25 / outside.pm25) * 100)
      : undefined;
  return {
    pin,
    outside,
    status:
      pin === undefined
        ? 'none'
        : loaded === undefined
          ? 'loading'
          : loaded.status === 'ready'
            ? 'ready'
            : loaded.status,
    lower,
  };
}

/** The room for the My Air card and the room page: the unit (connected, or the one saved), and what it reads. */
export function useRoom(): {
  readonly device: Device | undefined;
  readonly unit: UnitState;
  /** Connected now, with a reading. */
  readonly live: boolean;
  /** The last reading, only while the unit is connected or just lost. */
  readonly reading: UnitReading | undefined;
  readonly atMs: number | undefined;
  readonly aqi: number | undefined;
  readonly level: Level | undefined;
  readonly recent: UnitState['recent'];
  readonly comparison: ReturnType<typeof useRoomComparison>;
} {
  const unit = useUnitState();
  const { devices } = useDevices();
  const measured = devices.filter((d) => d.measured === true);
  const device = measured.find((d) => d.id === unit.deviceId) ?? measured[0];
  const mine = device !== undefined && unit.deviceId === device.id;
  const shows = mine && (unit.status === 'connected' || unit.status === 'lost');
  const reading = shows ? unit.latest?.reading : undefined;
  const aqi = reading === undefined ? undefined : (usAqi(reading.pm25)?.value ?? 0);
  const comparison = useRoomComparison(device, reading?.pm25);
  return {
    device,
    unit,
    live: mine && unit.status === 'connected' && reading !== undefined,
    reading,
    atMs: shows ? unit.latest?.atMs : undefined,
    aqi,
    level: aqi === undefined ? undefined : levelForAqi(aqi),
    recent: mine ? unit.recent : [],
    comparison,
  };
}
