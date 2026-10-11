import { useCallback, useEffect, useRef, useState } from 'react';
import { webBluetooth, type UnitLink, type UnitTransport } from './ble';
import { recordReading } from './measured';
import { isReading, parsePacket, type UnitReading } from './unitProtocol';

export type UnitStatus = 'idle' | 'connecting' | 'connected' | 'lost' | 'failed';

export interface UnitState {
  readonly status: UnitStatus;
  /** The name the unit advertises. */
  readonly name?: string;
  /** The app's device id the readings are kept under. */
  readonly deviceId?: string;
  /** True for the prototype's made-up unit: shown, never kept. */
  readonly simulated?: boolean;
  readonly latest?: { readonly reading: UnitReading; readonly atMs: number };
  /** The last few minutes of PM2.5, for a sparkline. */
  readonly recent: readonly { readonly atMs: number; readonly pm25: number }[];
  /** Words for the person when it could not connect or a packet was refused. */
  readonly problem?: string;
}

const RECENT_KEEP = 150;

const PROBLEMS: Readonly<Record<string, string>> = {
  too_short: 'The unit sent something too short to be a reading.',
  wrong_version: 'The unit speaks a different version. Update the unit’s firmware or the app.',
  no_particle_reading: 'The unit’s sensor has no reading yet.',
  out_of_range: 'The unit sent a number no real air could give, so it was not used.',
};

/**
 * Connects to a measuring unit, shows its readings as they come and keeps them: each good reading is added to the hour
 * it falls in, under the device the person set up, so Exposure can count the hours spent there. A reading taken while
 * the sensor is still warming up is shown but never kept.
 */
export function useUnit(
  options: {
    readonly transport?: UnitTransport;
    readonly storage?: Storage;
    readonly now?: () => number;
  } = {},
): {
  readonly state: UnitState;
  readonly supported: boolean;
  /** `named` is told the unit's name once it is found, and gives back the device id to keep its readings under. */
  readonly connect: (named: (bleName: string) => string) => Promise<void>;
  readonly disconnect: () => void;
} {
  const transport = options.transport ?? webBluetooth;
  const storage = options.storage ?? window.localStorage;
  const now = options.now ?? Date.now;
  const [state, setState] = useState<UnitState>({ status: 'idle', recent: [] });
  const link = useRef<UnitLink | undefined>(undefined);
  const deviceId = useRef<string | undefined>(undefined);
  const simulated = useRef(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      link.current?.disconnect();
    };
  }, []);

  const disconnect = useCallback(() => {
    link.current?.disconnect();
    link.current = undefined;
    setState((s) => ({ ...s, status: 'idle' }));
  }, []);

  const connect = useCallback(
    async (named: (bleName: string) => string): Promise<void> => {
      setState({ status: 'connecting', recent: [] });
      try {
        const opened = await transport.connect({
          onPacket: (bytes) => {
            if (!live.current) return;
            const parsed = parsePacket(bytes);
            if (!isReading(parsed)) {
              setState((s) => ({ ...s, problem: PROBLEMS[parsed] ?? 'A reading was refused.' }));
              return;
            }
            const atMs = now();
            if (!parsed.warming && !simulated.current && deviceId.current !== undefined)
              recordReading(storage, deviceId.current, atMs, parsed.pm25);
            setState((s) => {
              return {
                ...(s.name === undefined ? {} : { name: s.name }),
                ...(s.deviceId === undefined ? {} : { deviceId: s.deviceId }),
                ...(s.simulated === true ? { simulated: true } : {}),
                status: 'connected',
                latest: { reading: parsed, atMs },
                recent: parsed.warming
                  ? s.recent
                  : [...s.recent, { atMs, pm25: parsed.pm25 }].slice(-RECENT_KEEP),
              };
            });
          },
          onDisconnect: () => {
            if (!live.current) return;
            link.current = undefined;
            setState((s) => ({ ...s, status: s.status === 'idle' ? 'idle' : 'lost' }));
          },
        });
        link.current = opened;
        simulated.current = opened.simulated === true;
        deviceId.current = named(opened.name);
        if (live.current)
          setState((s) => ({
            ...s,
            name: opened.name,
            deviceId: deviceId.current ?? '',
            ...(simulated.current ? { simulated: true } : {}),
          }));
      } catch (error) {
        if (!live.current) return;
        const declined =
          error instanceof Error &&
          /cancel|chosen|denied|NotFound/iu.test(error.name + error.message);
        setState({
          status: declined ? 'idle' : 'failed',
          recent: [],
          ...(declined
            ? {}
            : {
                problem:
                  error instanceof Error ? error.message : 'The unit could not be connected.',
              }),
        });
      }
    },
    [transport, storage, now],
  );

  return { state, supported: transport.supported(), connect, disconnect };
}
