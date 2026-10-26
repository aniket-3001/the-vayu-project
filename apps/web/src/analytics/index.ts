import { API_URL } from '../config';
import { loadSession } from '../account/session';
import { createCollector, type Collector } from './collector';
import { deviceId, deviceInfo } from './device';
import type { Batch, Kind } from './types';

const FLUSH_EVERY_MS = 30_000;
const FLUSH_AT = 20;
const TOKEN_SPARE_MS = 60_000;

/** The signed-in person's ID token if one is held and still good; otherwise none, and the batch goes as anonymous. */
function heldToken(): string | undefined {
  try {
    const session = loadSession(window.localStorage);
    if (session === undefined || session.tokens.expiresAt - Date.now() <= TOKEN_SPARE_MS) return undefined;
    return session.tokens.idToken;
  } catch {
    return undefined;
  }
}

async function send(batch: Batch): Promise<boolean> {
  const token = heldToken();
  const res = await fetch(`${API_URL}${token === undefined ? '/v1/events' : '/v1/me/events'}`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(batch),
  });
  return res.ok;
}

let collector: Collector | undefined;
let queued = 0;
let visibleSince = Date.now();

/** Starts counting. Called once at startup. Does nothing in tests. */
export function startAnalytics(): void {
  if (collector !== undefined || import.meta.env.MODE === 'test') return;
  const made = createCollector({
    send,
    deviceId: () => deviceId(),
    sessionId: crypto.randomUUID(),
    device: () => deviceInfo(),
    now: () => new Date().toISOString(),
  });
  collector = made;
  made.track('session_start');
  const flush = (): void => {
    const seconds = Math.round((Date.now() - visibleSince) / 1000);
    if (document.visibilityState === 'visible' && seconds >= 1) made.track('active', '', Math.min(seconds, 3600));
    visibleSince = Date.now();
    queued = 0;
    void made.flush();
  };
  setInterval(flush, FLUSH_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else visibleSince = Date.now();
  });
}

/** Notes that something happened. Safe to call anywhere: it never throws and does nothing until analytics starts. */
export function track(kind: Kind, detail = '', n = 1): void {
  try {
    collector?.track(kind, detail, n);
    queued += 1;
    if (queued >= FLUSH_AT) {
      queued = 0;
      void collector?.flush();
    }
  } catch {
    // Counting must never break the app.
  }
}
