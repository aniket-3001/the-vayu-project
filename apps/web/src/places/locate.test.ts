// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserLocate } from './locate';

const fake = (script: ('ok' | 'timeout' | 'denied')[]): ReturnType<typeof vi.fn> => {
  const get = vi.fn((success: (p: unknown) => void, error: (e: unknown) => void) => {
    const step = script.shift();
    if (step === 'ok') success({ coords: { latitude: 28.5, longitude: 77.2 } });
    else error({ code: step === 'denied' ? 1 : 3 });
  });
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition: get },
    configurable: true,
  });
  return get;
};

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
});

describe('browserLocate', () => {
  it('accepts a recent fix, and looks once more with the precise sensor if the first look fails', () => {
    const get = fake(['timeout', 'ok']);
    const found = vi.fn();
    const fail = vi.fn();
    browserLocate(found, fail);
    expect(found).toHaveBeenCalledWith(28.5, 77.2);
    expect(fail).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[0]?.[2]).toMatchObject({ enableHighAccuracy: false });
    expect((get.mock.calls[0]?.[2] as { maximumAge: number }).maximumAge).toBeGreaterThan(0);
    expect(get.mock.calls[1]?.[2]).toMatchObject({ enableHighAccuracy: true });
  });

  it('does not ask again when the permission was refused', () => {
    const get = fake(['denied']);
    const fail = vi.fn();
    browserLocate(vi.fn(), fail);
    expect(fail).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('fails when both looks fail', () => {
    fake(['timeout', 'timeout']);
    const fail = vi.fn();
    browserLocate(vi.fn(), fail);
    expect(fail).toHaveBeenCalledTimes(1);
  });
});
