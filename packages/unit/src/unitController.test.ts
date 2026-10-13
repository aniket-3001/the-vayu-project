// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { UnitHandlers, UnitTransport } from './ble';
import { measuredHourly } from './measured';
import { UnitController } from './unitController';
import { encodePacket, type UnitReading } from './unitProtocol';

const AT = Date.parse('2026-10-10T06:00:00.000Z');
const free: UnitReading = {
  pm1: 70,
  pm25: 80,
  pm4: 85,
  pm10: 90,
  uptimeS: 100,
  warming: false,
  context: 'free',
};
const purified: UnitReading = {
  ...free,
  pm1: 4,
  pm25: 10,
  pm4: 11,
  pm10: 12,
  context: 'purifier',
  purifierTag: 0xbeef,
};

async function connected(): Promise<{
  send: (reading: UnitReading, times?: number) => void;
  controller: UnitController;
}> {
  let handlers: UnitHandlers | undefined;
  const transport: UnitTransport = {
    supported: () => true,
    connect(h) {
      handlers = h;
      return Promise.resolve({ name: 'Vayu-3F2A', disconnect: () => undefined });
    },
  };
  const controller = new UnitController({ storage: () => window.localStorage, now: () => AT });
  await controller.connect(transport, () => 'unit-1');
  return {
    controller,
    send: (reading, times = 1) => {
      for (let i = 0; i < times; i += 1) handlers?.onPacket(encodePacket(reading));
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('readings taken on the purifier', () => {
  it('are kept as the purifier’s own, and the room’s reading stays the last one off it', async () => {
    const { send, controller } = await connected();
    send(free);
    send(purified);
    const state = controller.getSnapshot();
    expect(state.latest?.reading.context).toBe('free');
    expect(state.latest?.reading.pm25).toBe(80);
    expect(state.purified?.reading.pm25).toBe(10);
    expect(state.purified?.reading.purifierTag).toBe(0xbeef);
    expect(state.onPurifier).toBe(true);
  });

  it('never enter the room’s chart', async () => {
    const { send, controller } = await connected();
    send(free, 3);
    send(purified, 3);
    expect(controller.getSnapshot().recent.map((r) => r.pm25)).toEqual([80, 80, 80]);
  });

  it('are never counted in the measured hours', async () => {
    const { send, controller } = await connected();
    send(free, 60);
    send(purified, 60);
    expect(controller.getSnapshot().recent).toHaveLength(60);
    // 06:00 UTC is 11:30 in India; only the 60 room readings, all 80, make the hour's mean.
    expect(measuredHourly(window.localStorage, 'unit-1', '2026-10-10')[11]).toBe(80);
  });

  it('count for nothing at all when only purified readings arrive', async () => {
    const { send } = await connected();
    send(purified, 100);
    expect(measuredHourly(window.localStorage, 'unit-1', '2026-10-10')[11]).toBeUndefined();
  });

  it('end when the unit is lifted off: the next room reading puts the app back to the room', async () => {
    const { send, controller } = await connected();
    send(purified);
    expect(controller.getSnapshot().onPurifier).toBe(true);
    send(free);
    expect(controller.getSnapshot().onPurifier).toBe(false);
    expect(controller.getSnapshot().latest?.reading.context).toBe('free');
  });

  it('start as not on a purifier, and go back to that when disconnected from scratch', async () => {
    const { send, controller } = await connected();
    expect(controller.getSnapshot().onPurifier).toBe(false);
    send(purified);
    controller.reset();
    expect(controller.getSnapshot().onPurifier).toBe(false);
    expect(controller.getSnapshot().purified).toBeUndefined();
  });
});
