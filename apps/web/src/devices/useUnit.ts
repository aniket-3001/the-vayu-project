import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { track } from '../analytics';
import { type UnitTransport, UnitController, sharedUnit, type UnitState } from '@vayu/unit';
import { defaultTransport } from './transport';

export type { UnitState, UnitStatus } from '@vayu/unit';

/** The state of the app's one measuring unit, for any screen that shows it. It never connects or disconnects. */
export function useUnitState(): UnitState {
  return useSyncExternalStore(sharedUnit.subscribe, sharedUnit.getSnapshot);
}

/**
 * Connects to a measuring unit and shows its readings as they come. With no options this is the app's one shared unit,
 * which stays connected when the screen is left. A test passes its own transport, storage or clock and gets a unit of
 * its own, disconnected when the screen goes.
 */
export function useUnit(
  options: {
    readonly transport?: UnitTransport;
    readonly storage?: Storage;
    readonly now?: () => number;
    /** Gives the screen a unit of its own, not the app's shared one. */
    readonly own?: boolean;
  } = {},
): {
  readonly state: UnitState;
  readonly supported: boolean;
  /** `named` is told the unit's name once it is found, and gives back the device id to keep its readings under. */
  readonly connect: (named: (bleName: string) => string) => Promise<void>;
  readonly disconnect: () => void;
} {
  const transport = options.transport ?? defaultTransport;
  const separate =
    options.own === true || options.storage !== undefined || options.now !== undefined;
  const { storage, now } = options;
  const controller = useMemo(
    () =>
      separate
        ? new UnitController({
            ...(storage === undefined ? {} : { storage: () => storage }),
            ...(now === undefined ? {} : { now }),
          })
        : sharedUnit,
    // The options are fixed for the life of the screen.
    [],
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(
    () => () => {
      if (controller !== sharedUnit) controller.disconnect();
    },
    [controller],
  );
  return {
    state,
    supported: transport.supported(),
    connect: (named) => {
      track('feature', 'bluetooth_connect');
      const attempt = controller.connect(transport, named);
      Promise.resolve(attempt).then(
        () => {
          track('bluetooth', 'connect:ok');
        },
        () => {
          track('bluetooth', 'connect:fail');
        },
      );
      return attempt;
    },
    disconnect: controller.disconnect,
  };
}
