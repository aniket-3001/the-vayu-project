import type { Page, Route } from '@playwright/test';

const HOUR = 3_600_000;

/** A `/v1/today` answer (checked against the contract in mock.test.ts) for "now": a nearby monitor, PM2.5 near 60 µg/m³ (US AQI 154), four days of hours. */
export function todayAnswer(now = Date.now()): unknown {
  const hourStart = Math.floor(now / HOUR) * HOUR;
  const asOf = new Date(now).toISOString();
  const hours = Array.from({ length: 48 + 96 }, (_, i) => {
    const offset = i - 48; // 0 is the hour in progress
    const start = hourStart + offset * HOUR;
    return {
      t: new Date(start).toISOString(),
      pm25: 60 + offset * 0.2,
      kind: start + HOUR <= now ? ('observed' as const) : ('forecast' as const),
    };
  });
  const lastObservedEnd = hourStart; // the last hour that has finished
  return {
    schemaVersion: 1,
    place: { id: 'gps', name: 'Your location', kind: 'other', lat: 28.61, lng: 77.21 },
    asOf,
    mode: 'live',
    hours,
    windows: [],
    headline: 'No clean hour today.',
    prov: {
      mode: 'live',
      label: 'Nearby station',
      source: 'station',
      stationId: 'e2e-1',
      stationName: 'Test Monitor',
      distanceKm: 2.5,
      observedAt: new Date(lastObservedEnd).toISOString(),
      fetchedAt: asOf,
      asOf,
      ageMinutes: Math.max(0, Math.round((now - lastObservedEnd) / 60_000)),
    },
  };
}

/** Return this from `today` to make the request fail like a dropped connection. */
export const DROP = Symbol('drop the request');

export interface ApiOptions {
  /** Answers `/v1/today`; the default is a good reading. */
  readonly today?: () => unknown;
}

const json = (route: Route, body: unknown, status = 200): Promise<void> =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Stands in for our API and keeps the page off the real internet. Anything the test does not expect gets a plain 404,
 * and any other website is refused, so a stray request shows up as a failure instead of a flaky pass.
 */
export async function fakeApi(page: Page, options: ApiOptions = {}): Promise<{ seen: string[] }> {
  const seen: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort('blockedbyclient');
    if (!url.pathname.startsWith('/v1/')) return route.continue();
    seen.push(`${route.request().method()} ${url.pathname}`);
    switch (url.pathname) {
      case '/v1/auth-config':
        return json(route, { enabled: false });
      case '/v1/app-config':
        return json(route, { minAppVersion: '0.0.0' });
      case '/v1/today': {
        const answer = options.today === undefined ? todayAnswer() : options.today();
        return answer === DROP ? route.abort('connectionfailed') : json(route, answer);
      }
      case '/v1/fires':
        return json(route, {
          asOf: new Date().toISOString(),
          source: 'NASA FIRMS satellite fire detections',
          mode: 'live',
          counts: { last24h: 0, last72h: 0 },
          detections: [],
        });
      case '/v1/events':
        return json(route, {}, 202);
      default:
        return json(route, { error: { code: 'not_found', message: 'not faked' } }, 404);
    }
  });
  return { seen };
}

/** Saves one place on the device before the app starts, as a person who has already added Home. */
export async function saveHome(page: Page): Promise<void> {
  const pins = JSON.stringify([{ id: '28.61,77.21', name: 'Home', lat: 28.61, lng: 77.21 }]);
  // Written as a script string, because this file is Node code and has no browser types.
  await page.addInitScript(
    `if (localStorage.getItem('vayu.pins.v1') === null) localStorage.setItem('vayu.pins.v1', ${JSON.stringify(pins)});`,
  );
}
