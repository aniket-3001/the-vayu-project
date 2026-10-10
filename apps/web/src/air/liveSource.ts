import { History, Stations, Today } from '@vayu/contracts';
import type { Pin } from '../data/pins';
import { todayDataFromApi } from './fromApi';
import type { AirSource } from './types';

/** How long to wait for our API before saying so. */
const TIMEOUT_MS = 12_000;

/** A failure with words a person can read: what happened, and whether trying again could help. */
export class AirRequestError extends Error {}

async function getJson(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: controller.signal });
  } catch {
    throw new AirRequestError(
      controller.signal.aborted
        ? 'The server took too long to answer.'
        : 'We could not reach the server. Check your connection.',
    );
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    let message = `The server answered with an error (${String(response.status)}).`;
    try {
      const body = (await response.json()) as { error?: { message?: unknown } };
      if (typeof body.error?.message === 'string') message = body.error.message;
    } catch {
      // The status is all we have.
    }
    throw new AirRequestError(message);
  }
  try {
    return await response.json();
  } catch {
    throw new AirRequestError('The server sent something we could not read.');
  }
}

const near = (pin: Pin): string => `lat=${pin.lat.toFixed(2)}&lng=${pin.lng.toFixed(2)}`;

/**
 * The air from our own API on AWS: the nearest monitor with a recent reading, a regional model where there is
 * none, and the weather. Every answer is checked against its contract before it is used, and a bad one is an
 * error, never a number.
 */
export function liveAirSource(
  baseUrl: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  timeoutMs = TIMEOUT_MS,
): AirSource {
  const root = baseUrl.replace(/\/+$/u, '');
  const parse = <T>(parser: { parse(value: unknown): T }, raw: unknown): T => {
    try {
      return parser.parse(raw);
    } catch {
      throw new AirRequestError('The server sent something we did not expect.');
    }
  };
  return {
    kind: 'live',
    async today(pin) {
      const raw = await getJson(fetchImpl, `${root}/v1/today?${near(pin)}`, timeoutMs);
      return todayDataFromApi(pin, parse(Today, raw));
    },
    async history(pin) {
      const raw = await getJson(fetchImpl, `${root}/v1/history?${near(pin)}&days=14`, timeoutMs);
      return parse(History, raw).hours.map((h) => ({ t: h.t, pm25: h.pm25 }));
    },
    async stations() {
      const raw = await getJson(fetchImpl, `${root}/v1/stations`, timeoutMs);
      return parse(Stations, raw).stations;
    },
  };
}
