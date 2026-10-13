import { describe, expect, it } from 'vitest';
import { createNativeBle, type BleClientLike } from './nativeBle';
import { UNIT_READING_UUID, UNIT_SERVICE_UUID } from './unitProtocol';

interface Fake {
  readonly client: BleClientLike;
  readonly calls: string[];
  readonly requested: { services: string[] }[];
  push(bytes: number[]): void;
  drop(): void;
}

function fake(
  options: {
    failAt?: 'initialize' | 'requestDevice' | 'connect' | 'startNotifications';
    error?: Error;
  } = {},
): Fake {
  const calls: string[] = [];
  const requested: { services: string[] }[] = [];
  let notify: ((value: DataView) => void) | undefined;
  let dropped: (() => void) | undefined;
  const maybeFail = (step: NonNullable<typeof options.failAt>): Promise<void> =>
    options.failAt === step
      ? Promise.reject(options.error ?? new Error('failed'))
      : Promise.resolve();
  const client: BleClientLike = {
    async initialize() {
      calls.push('initialize');
      await maybeFail('initialize');
    },
    async requestDevice(request) {
      calls.push('requestDevice');
      requested.push(request);
      await maybeFail('requestDevice');
      return { deviceId: 'AA:BB', name: 'Vayu-3F2A' };
    },
    async connect(deviceId, onDisconnect) {
      calls.push(`connect ${deviceId}`);
      dropped = () => {
        onDisconnect(deviceId);
      };
      await maybeFail('connect');
    },
    async startNotifications(deviceId, service, characteristic, callback) {
      calls.push(`notify ${deviceId} ${service} ${characteristic}`);
      notify = callback;
      await maybeFail('startNotifications');
    },
    disconnect(deviceId) {
      calls.push(`disconnect ${deviceId}`);
      dropped?.();
      return Promise.resolve();
    },
  };
  return {
    client,
    calls,
    requested,
    push(bytes) {
      notify?.(new DataView(new Uint8Array(bytes).buffer));
    },
    drop() {
      dropped?.();
    },
  };
}

const handlers = (): {
  packets: number[][];
  disconnects: { count: number };
  value: { onPacket: (b: Uint8Array) => void; onDisconnect: () => void };
} => {
  const packets: number[][] = [];
  const disconnects = { count: 0 };
  return {
    packets,
    disconnects,
    value: {
      onPacket: (bytes) => packets.push([...bytes]),
      onDisconnect: () => {
        disconnects.count += 1;
      },
    },
  };
};

describe('the native Bluetooth transport', () => {
  it('is always supported inside the app', () => {
    expect(createNativeBle(() => Promise.resolve(fake().client)).supported()).toBe(true);
  });

  it('looks for the unit by its service, connects and hands over each packet as bytes', async () => {
    const f = fake();
    const h = handlers();
    const link = await createNativeBle(() => Promise.resolve(f.client)).connect(h.value);
    expect(f.requested).toEqual([{ services: [UNIT_SERVICE_UUID] }]);
    expect(f.calls).toContain(`notify AA:BB ${UNIT_SERVICE_UUID} ${UNIT_READING_UUID}`);
    expect(link.name).toBe('Vayu-3F2A');
    f.push([1, 2, 3]);
    expect(h.packets).toEqual([[1, 2, 3]]);
  });

  it('tells the app once when the unit drops, and ignores packets after that', async () => {
    const f = fake();
    const h = handlers();
    await createNativeBle(() => Promise.resolve(f.client)).connect(h.value);
    f.drop();
    f.drop();
    f.push([9]);
    expect(h.disconnects.count).toBe(1);
    expect(h.packets).toEqual([]);
  });

  it('disconnects the unit when the person does, and says so once', async () => {
    const f = fake();
    const h = handlers();
    const link = await createNativeBle(() => Promise.resolve(f.client)).connect(h.value);
    link.disconnect();
    link.disconnect();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.calls.filter((c) => c === 'disconnect AA:BB')).toHaveLength(1);
    expect(h.disconnects.count).toBe(1);
  });

  it('says plainly that no unit was chosen when the picker is closed', async () => {
    const f = fake({ failAt: 'requestDevice', error: new Error('requestDevice cancelled') });
    await expect(
      createNativeBle(() => Promise.resolve(f.client)).connect(handlers().value),
    ).rejects.toThrow('No unit was chosen.');
  });

  it('says plainly that permission was refused', async () => {
    const f = fake({ failAt: 'initialize', error: new Error('Permission denied') });
    await expect(
      createNativeBle(() => Promise.resolve(f.client)).connect(handlers().value),
    ).rejects.toThrow('Bluetooth permission was refused');
  });

  it('says plainly that Bluetooth is off', async () => {
    const f = fake({ failAt: 'initialize', error: new Error('Bluetooth is disabled') });
    await expect(
      createNativeBle(() => Promise.resolve(f.client)).connect(handlers().value),
    ).rejects.toThrow('Bluetooth is off');
  });

  it('lets go of the unit if it fails after connecting', async () => {
    const f = fake({ failAt: 'startNotifications', error: new Error('gatt error 133') });
    await expect(
      createNativeBle(() => Promise.resolve(f.client)).connect(handlers().value),
    ).rejects.toThrow('Could not connect to the unit: gatt error 133');
    expect(f.calls).toContain('disconnect AA:BB');
  });
});
