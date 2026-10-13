import type { UnitHandlers, UnitLink, UnitTransport } from './ble';
import { UNIT_READING_UUID, UNIT_SERVICE_UUID } from './unitProtocol';

/** The part of the Capacitor Bluetooth LE plugin used here, so a test can pass a fake. */
export interface BleClientLike {
  initialize(options?: { androidNeverForLocation?: boolean }): Promise<void>;
  requestDevice(options: {
    services: string[];
  }): Promise<{ readonly deviceId: string; readonly name?: string | undefined }>;
  connect(deviceId: string, onDisconnect: (deviceId: string) => void): Promise<void>;
  startNotifications(
    deviceId: string,
    service: string,
    characteristic: string,
    callback: (value: DataView) => void,
  ): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
}

/** The plugin is loaded only when a unit is first connected, so the website's build never holds it. */
const loadPlugin = async (): Promise<BleClientLike> =>
  (await import('@capacitor-community/bluetooth-le')).BleClient;

/** The plugin's own messages are for developers; these are for the person holding the phone. */
function readable(error: unknown): Error {
  const text = error instanceof Error ? error.message : String(error);
  if (/cancel/iu.test(text)) return new Error('No unit was chosen.');
  if (/permission|denied|unauthori[sz]ed/iu.test(text)) {
    return new Error(
      'Bluetooth permission was refused. Allow it in the phone settings to connect a unit.',
    );
  }
  if (/disabled|powered off|not enabled|turned off|bluetooth is off/iu.test(text)) {
    return new Error('Bluetooth is off. Turn it on and try again.');
  }
  return new Error(`Could not connect to the unit: ${text}`);
}

/** Bluetooth Low Energy through the app's native plugin: the same unit and packets as in the browser, also on iPhone. */
export function createNativeBle(load: () => Promise<BleClientLike> = loadPlugin): UnitTransport {
  return {
    supported: () => true,
    async connect(handlers: UnitHandlers): Promise<UnitLink> {
      const ble = await load();
      let deviceId: string | undefined;
      let open = true;
      const closed = (): void => {
        if (!open) return;
        open = false;
        handlers.onDisconnect();
      };
      try {
        await ble.initialize({ androidNeverForLocation: true });
        const device = await ble.requestDevice({ services: [UNIT_SERVICE_UUID] });
        deviceId = device.deviceId;
        await ble.connect(deviceId, closed);
        await ble.startNotifications(deviceId, UNIT_SERVICE_UUID, UNIT_READING_UUID, (value) => {
          if (open)
            handlers.onPacket(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        });
        const id = deviceId;
        return {
          name: device.name ?? 'Vayu unit',
          disconnect: () => {
            if (!open) return;
            void ble.disconnect(id).finally(closed);
          },
        };
      } catch (error) {
        open = false;
        if (deviceId !== undefined) await ble.disconnect(deviceId).catch(() => undefined);
        throw readable(error);
      }
    },
  };
}

export const nativeBle: UnitTransport = createNativeBle();
