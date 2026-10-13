import { describe, expect, it, vi } from 'vitest';
import { SPLASH_MIN_MS, hideSplash } from './splash';

function fake(): {
  hidden: { fadeOutDuration?: number }[];
  waits: number[];
  options: Parameters<typeof hideSplash>[0];
} {
  const hidden: { fadeOutDuration?: number }[] = [];
  const waits: number[] = [];
  return {
    hidden,
    waits,
    options: {
      load: () =>
        Promise.resolve({
          hide: (o) => {
            hidden.push(o ?? {});
            return Promise.resolve();
          },
        }),
      wait: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    },
  };
}

describe('the startup screen of the phone app', () => {
  it('does nothing in the website', async () => {
    const f = fake();
    await hideSplash({ ...f.options, native: false });
    expect(f.hidden).toEqual([]);
    expect(f.waits).toEqual([]);
  });

  it('stays for at least the minimum time, then fades out', async () => {
    const f = fake();
    await hideSplash({ ...f.options, native: true, sinceStartMs: 200 });
    expect(f.waits).toEqual([SPLASH_MIN_MS - 200]);
    expect(f.hidden).toEqual([{ fadeOutDuration: 300 }]);
  });

  it('goes at once when the app took longer than the minimum to start', async () => {
    const f = fake();
    await hideSplash({ ...f.options, native: true, sinceStartMs: SPLASH_MIN_MS + 500 });
    expect(f.waits).toEqual([]);
    expect(f.hidden).toHaveLength(1);
  });

  it('hides through the real plugin, which, like Capacitor, refuses to be treated as a promise', async () => {
    const hide = vi.fn(() => Promise.resolve());
    vi.resetModules();
    vi.stubEnv('VITE_NATIVE', 'true');
    vi.doMock('@capacitor/splash-screen', () => ({
      SplashScreen: {
        hide,
        then: () => {
          throw new Error('"SplashScreen.then()" is not implemented on web');
        },
      },
    }));
    try {
      const { hideSplash: fresh } = await import('./splash');
      await fresh({ native: true, sinceStartMs: SPLASH_MIN_MS });
      expect(hide).toHaveBeenCalledWith({ fadeOutDuration: 300 });
    } finally {
      vi.doUnmock('@capacitor/splash-screen');
      vi.unstubAllEnvs();
    }
  });

  it('never throws when the plugin is missing', async () => {
    await expect(
      hideSplash({
        native: true,
        sinceStartMs: SPLASH_MIN_MS,
        load: () => Promise.reject(new Error('no plugin')),
      }),
    ).resolves.toBeUndefined();
  });
});
