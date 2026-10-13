import { describe, expect, it, vi } from 'vitest';
import { phoneGeolocation, type LocationPlugin } from './geolocation';

const position = { coords: { latitude: 28.6, longitude: 77.2 }, timestamp: 1 };
const plugin = (over: Partial<LocationPlugin> = {}): LocationPlugin => ({
  checkPermissions: () => Promise.resolve({ location: 'granted' }),
  requestPermissions: () => Promise.resolve({ location: 'granted' }),
  getCurrentPosition: () => Promise.resolve(position as never),
  ...over,
});
const ask = (
  p: LocationPlugin,
): Promise<{ ok?: unknown; fail?: { code: number; message: string } }> =>
  new Promise((resolve) => {
    phoneGeolocation(() => Promise.resolve(p)).getCurrentPosition(
      (ok) => {
        resolve({ ok });
      },
      (fail) => {
        resolve({ fail });
      },
    );
  });

describe('phoneGeolocation', () => {
  it('gives the position when the phone allows it', async () => {
    expect((await ask(plugin())).ok).toBe(position);
  });

  it('asks for permission when it is not yet given, then locates', async () => {
    const request = vi.fn(() => Promise.resolve({ location: 'granted' }));
    const got = await ask(
      plugin({
        checkPermissions: () => Promise.resolve({ location: 'prompt' }),
        requestPermissions: request,
      }),
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(got.ok).toBe(position);
  });

  it('reports a refusal as permission denied, without locating', async () => {
    const locate = vi.fn();
    const got = await ask(
      plugin({
        checkPermissions: () => Promise.resolve({ location: 'denied' }),
        requestPermissions: () => Promise.resolve({ location: 'denied' }),
        getCurrentPosition: locate,
      }),
    );
    expect(got.fail?.code).toBe(1);
    expect(locate).not.toHaveBeenCalled();
  });

  it("reports the phone's own reason when it cannot find the position, and a timeout as a timeout", async () => {
    const off = await ask(
      plugin({
        getCurrentPosition: () => Promise.reject(new Error('Location services are not enabled')),
      }),
    );
    expect(off.fail).toMatchObject({ code: 2, message: 'Location services are not enabled' });
    const slow = await ask(
      plugin({ getCurrentPosition: () => Promise.reject(new Error('Timeout expired')) }),
    );
    expect(slow.fail?.code).toBe(3);
  });
});
