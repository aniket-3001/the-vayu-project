import { UNIT_NAME_PREFIX, UNIT_READING_UUID, UNIT_SERVICE_UUID } from './unitProtocol';

/** A connection to one unit, which can be ended. */
export interface UnitLink {
  /** The name the unit advertises, such as "Vayu-3F2A". */
  readonly name: string;
  disconnect(): void;
}

export interface UnitHandlers {
  /** One packet of bytes from the unit. */
  readonly onPacket: (bytes: Uint8Array) => void;
  /** The link was lost, by the unit going out of range or off, or by the person. */
  readonly onDisconnect: () => void;
}

/** What connects to a unit: Bluetooth in the app, or a fake one in the tests. */
export interface UnitTransport {
  /** Whether this browser can do it at all. */
  supported(): boolean;
  /** Asks the person to pick a unit, then connects and starts the readings. Rejects if they decline or it fails. */
  connect(handlers: UnitHandlers): Promise<UnitLink>;
}

/** The small part of the Web Bluetooth API used here, so no type package is needed. */
interface CharacteristicLike {
  startNotifications(): Promise<unknown>;
  addEventListener(
    type: 'characteristicvaluechanged',
    listener: (event: { readonly target: { readonly value?: DataView } | null }) => void,
  ): void;
}
interface ServerLike {
  connected: boolean;
  disconnect(): void;
  getPrimaryService(
    uuid: string,
  ): Promise<{ getCharacteristic(uuid: string): Promise<CharacteristicLike> }>;
}
interface DeviceLike {
  readonly name?: string;
  readonly gatt?: { connect(): Promise<ServerLike> };
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void;
}
interface BluetoothLike {
  requestDevice(options: {
    filters: readonly Record<string, unknown>[];
    optionalServices: readonly string[];
  }): Promise<DeviceLike>;
}

const bluetooth = (): BluetoothLike | undefined =>
  typeof navigator === 'undefined'
    ? undefined
    : (navigator as unknown as { bluetooth?: BluetoothLike }).bluetooth;

/**
 * Bluetooth Low Energy in the browser (Web Bluetooth): Chrome on Android, and on a computer. Safari on an iPhone does
 * not have it. The page must be served over HTTPS, as the app is, and the person picks the unit from the browser's own
 * list, so nothing is connected without their say.
 */
export const webBluetooth: UnitTransport = {
  supported: () => bluetooth() !== undefined,
  async connect(handlers) {
    const api = bluetooth();
    if (api === undefined) throw new Error('This browser cannot connect over Bluetooth.');
    const device = await api.requestDevice({
      filters: [{ services: [UNIT_SERVICE_UUID] }, { namePrefix: UNIT_NAME_PREFIX }],
      optionalServices: [UNIT_SERVICE_UUID],
    });
    const gatt = device.gatt;
    if (gatt === undefined) throw new Error('That device does not offer a Bluetooth connection.');
    device.addEventListener('gattserverdisconnected', handlers.onDisconnect);
    const server = await gatt.connect();
    const service = await server.getPrimaryService(UNIT_SERVICE_UUID);
    const characteristic = await service.getCharacteristic(UNIT_READING_UUID);
    characteristic.addEventListener('characteristicvaluechanged', (event) => {
      const value = event.target?.value;
      if (value !== undefined)
        handlers.onPacket(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    });
    await characteristic.startNotifications();
    return {
      name: device.name ?? 'Vayu unit',
      disconnect: () => {
        if (server.connected) server.disconnect();
      },
    };
  },
};
