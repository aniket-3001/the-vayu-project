import { describe, expect, it, vi } from 'vitest';
import { cleanEvent, scrub, startCrashReporting, type SentryLike } from './crashReporting';

const fake = (): { sentry: SentryLike; init: ReturnType<typeof vi.fn> } => {
  const init = vi.fn();
  return { sentry: { init }, init };
};

describe('startCrashReporting', () => {
  it('does nothing, and loads nothing, without a DSN', async () => {
    const load = vi.fn();
    expect(await startCrashReporting({ dsn: undefined, load })).toBe(false);
    expect(await startCrashReporting({ dsn: '', load })).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('starts with no personal data, no traces and no breadcrumbs when there is a DSN', async () => {
    const { sentry, init } = fake();
    expect(
      await startCrashReporting({
        dsn: 'https://k@example.ingest.sentry.io/1',
        load: () => Promise.resolve(sentry),
      }),
    ).toBe(true);
    const options = init.mock.calls[0]?.[0] as Record<string, unknown> & {
      beforeBreadcrumb: () => unknown;
    };
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.beforeBreadcrumb()).toBeNull();
    expect(String(options.release)).toMatch(/^vayu@\d/u);
  });

  it('never lets a failure to start reach the app', async () => {
    const load = (): Promise<SentryLike> => Promise.reject(new Error('blocked'));
    expect(await startCrashReporting({ dsn: 'https://k@x/1', load })).toBe(false);
    const broken: SentryLike = {
      init: () => {
        throw new Error('bad dsn');
      },
    };
    expect(
      await startCrashReporting({ dsn: 'https://k@x/1', load: () => Promise.resolve(broken) }),
    ).toBe(false);
  });
});

describe('what leaves the device', () => {
  it('scrubs coordinate pairs and lat/lng parameters', () => {
    expect(scrub('failed at 28.6139, 77.2090 now')).toBe('failed at [place] now');
    expect(scrub('GET /v1/today?lat=28.61&lng=77.21 failed')).toBe(
      'GET /v1/today?lat=[place]&lng=[place] failed',
    );
    expect(scrub('Timed out after 6000 ms')).toBe('Timed out after 6000 ms');
  });

  it('removes the person, the request and the breadcrumbs, and scrubs the messages', () => {
    const out = cleanEvent({
      user: { id: 'abc', ip_address: '1.2.3.4' },
      request: { url: 'https://x/#/place/28.61,77.21' },
      breadcrumbs: [{ message: 'fetch lat=28.6' }],
      message: 'bad 28.6139,77.2090',
      exception: { values: [{ value: 'no air at lat=28.61' }, {}] },
      level: 'error',
    });
    expect(out).not.toHaveProperty('user');
    expect(out).not.toHaveProperty('request');
    expect(out).not.toHaveProperty('breadcrumbs');
    expect(out.message).toBe('bad [place]');
    expect(out.exception?.values?.[0]?.value).toBe('no air at lat=[place]');
    expect(out.level).toBe('error');
  });
});
