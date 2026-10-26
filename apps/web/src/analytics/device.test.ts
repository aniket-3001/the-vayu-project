// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PINS_STORAGE_KEY } from '../data/pins';
import { deviceId, deviceInfo, DEVICE_KEY } from './device';

const memoryStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
    clear: () => { m.clear(); },
    key: () => null,
    get length() {
      return m.size;
    },
  };
};

describe('device', () => {
  it('keeps the same id across calls', () => {
    const s = memoryStorage();
    expect(deviceId(s)).toBe(deviceId(s));
    expect(s.getItem(DEVICE_KEY)).toBe(deviceId(s));
  });

  it('still gives an id when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(deviceId(broken)).toMatch(/^[A-Za-z0-9-]{8,64}$/u);
    expect(deviceId(broken)).toBe(deviceId(broken));
  });

  it('says web outside a phone and rounds the first saved place to one decimal', () => {
    const s = memoryStorage();
    s.setItem(PINS_STORAGE_KEY, JSON.stringify([{ id: 'a', name: 'Home', lat: 12.9716, lng: 77.5946 }]));
    const info = deviceInfo(s);
    expect(info.platform).toBe('web');
    expect(info.cell).toEqual({ lat: 13, lng: 77.6 });
    expect(JSON.stringify(info)).not.toContain('Home');
  });

  it('with nothing saved, sends only the rounded default place', () => {
    const cell = deviceInfo(memoryStorage()).cell;
    expect(cell).toEqual({ lat: Math.round((cell?.lat ?? 0) * 10) / 10, lng: Math.round((cell?.lng ?? 0) * 10) / 10 });
  });
});
