// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UnitHandlers, UnitLink, UnitTransport } from './ble';
import { measuredHourly } from './measured';
import { encodePacket, type UnitReading } from './unitProtocol';
import { useUnit } from './useUnit';

beforeEach(() => {
  window.localStorage.clear();
});

const AT = Date.parse('2026-10-10T06:00:00.000Z');
const base: UnitReading = {
  pm1: 20,
  pm25: 30,
  pm4: 33,
  pm10: 36,
  temperatureC: 27,
  humidityPct: 50,
  uptimeS: 100,
  warming: false,
};

/** A transport the test drives by hand. */
function fake(options: { simulated?: boolean; fail?: Error } = {}): {
  transport: UnitTransport;
  send: (bytes: Uint8Array) => void;
  drop: () => void;
} {
  let handlers: UnitHandlers | undefined;
  return {
    transport: {
      supported: () => true,
      connect(h) {
        if (options.fail !== undefined) return Promise.reject(options.fail);
        handlers = h;
        const link: UnitLink = {
          name: 'Vayu-3F2A',
          ...(options.simulated === true ? { simulated: true } : {}),
          disconnect: () => undefined,
        };
        return Promise.resolve(link);
      },
    },
    send: (bytes) => {
      handlers?.onPacket(bytes);
    },
    drop: () => {
      handlers?.onDisconnect();
    },
  };
}

describe('connecting a unit', () => {
  it('shows readings as they come and keeps each good one under the device it was given', async () => {
    const unit = fake();
    let clock = AT;
    const { result } = renderHook(() =>
      useUnit({ transport: unit.transport, storage: window.localStorage, now: () => clock }),
    );
    await act(async () => {
      await result.current.connect((name) => `unit:${name}`);
    });
    expect(result.current.state.deviceId).toBe('unit:Vayu-3F2A');
    for (let i = 0; i < 65; i++) {
      clock = AT + i * 2000;
      act(() => {
        unit.send(encodePacket({ ...base, pm25: 30 }));
      });
    }
    expect(result.current.state.status).toBe('connected');
    expect(result.current.state.latest?.reading.pm25).toBeCloseTo(30);
    expect(measuredHourly(window.localStorage, 'unit:Vayu-3F2A', '2026-10-10')[11]).toBe(30);
  });

  it('shows a warming reading but does not keep it', async () => {
    const unit = fake();
    const { result } = renderHook(() =>
      useUnit({ transport: unit.transport, storage: window.localStorage, now: () => AT }),
    );
    await act(async () => {
      await result.current.connect((name) => `unit:${name}`);
    });
    for (let i = 0; i < 70; i++)
      act(() => {
        unit.send(encodePacket({ ...base, warming: true }));
      });
    expect(result.current.state.latest?.reading.warming).toBe(true);
    expect(measuredHourly(window.localStorage, 'unit:Vayu-3F2A', '2026-10-10')[11]).toBeUndefined();
  });

  it('says why when a packet is refused, and never keeps it', async () => {
    const unit = fake();
    const { result } = renderHook(() =>
      useUnit({ transport: unit.transport, storage: window.localStorage, now: () => AT }),
    );
    await act(async () => {
      await result.current.connect((name) => `unit:${name}`);
    });
    act(() => {
      unit.send(encodePacket({ ...base, pm25: 2000, pm4: 2000, pm10: 2000 }));
    });
    expect(result.current.state.problem).toMatch(/no real air/u);
    expect(result.current.state.latest).toBeUndefined();
  });

  it('is marked lost when the link drops, and keeps what it measured', async () => {
    const unit = fake();
    const { result } = renderHook(() =>
      useUnit({ transport: unit.transport, storage: window.localStorage, now: () => AT }),
    );
    await act(async () => {
      await result.current.connect((name) => `unit:${name}`);
    });
    act(() => {
      unit.send(encodePacket(base));
    });
    act(() => {
      unit.drop();
    });
    expect(result.current.state.status).toBe('lost');
    expect(result.current.state.latest?.reading.pm25).toBeCloseTo(30);
  });

  it('does not keep readings from a simulated unit', async () => {
    const unit = fake({ simulated: true });
    const { result } = renderHook(() =>
      useUnit({ transport: unit.transport, storage: window.localStorage, now: () => AT }),
    );
    await act(async () => {
      await result.current.connect((name) => `unit:${name}`);
    });
    for (let i = 0; i < 70; i++)
      act(() => {
        unit.send(encodePacket(base));
      });
    expect(result.current.state.simulated).toBe(true);
    expect(measuredHourly(window.localStorage, 'unit:Vayu-3F2A', '2026-10-10')[11]).toBeUndefined();
  });

  it('goes quietly back to idle when the person declines, and says so when it fails', async () => {
    const declined = fake({
      fail: Object.assign(new Error('User cancelled'), { name: 'NotFoundError' }),
    });
    const a = renderHook(() => useUnit({ transport: declined.transport }));
    await act(async () => {
      await a.result.current.connect((name) => name);
    });
    expect(a.result.current.state.status).toBe('idle');
    expect(a.result.current.state.problem).toBeUndefined();
    const broken = fake({ fail: new Error('GATT operation failed') });
    const b = renderHook(() => useUnit({ transport: broken.transport }));
    await act(async () => {
      await b.result.current.connect((name) => name);
    });
    expect(b.result.current.state.status).toBe('failed');
    expect(b.result.current.state.problem).toMatch(/GATT/u);
  });
});
