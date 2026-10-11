import { useToday } from '../air/store';
import type { Pin } from '../data/pins';
import { useHousehold, useSpots } from '../exposure/useExposure';
import { usePins } from '../places/usePins';
import type { TodayData } from '../today/types';
import type { Device } from './devices';

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
