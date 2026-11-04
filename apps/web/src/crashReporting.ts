/**
 * Optional crash reporting. With no `VITE_SENTRY_DSN` at build time this does nothing and loads nothing: the website and
 * the phone apps behave exactly as before. With one, errors the app does not handle are sent to Sentry with the app's
 * version and build, and with everything that could identify a person or a place taken out first.
 *
 * What is never sent: the person (no id, email or address), the page address, request details, the trail of earlier
 * screens and calls (they hold coordinates and search words), and any pair of coordinates inside an error message.
 */
import { APP_VERSION } from './analytics/device';

/** The few parts of Sentry's browser SDK used here, so a test can stand in for it. */
export interface SentryLike {
  init(options: Record<string, unknown>): void;
}

export interface CrashReportingOptions {
  readonly dsn?: string | undefined;
  readonly release?: string;
  readonly environment?: string;
  readonly load?: () => Promise<SentryLike>;
}

/** Takes anything that looks like a coordinate pair or a decimal latitude/longitude out of a piece of text. */
export function scrub(text: string): string {
  return text
    .replace(/-?\d{1,3}\.\d{2,}\s*[,;]\s*-?\d{1,3}\.\d{2,}/gu, '[place]')
    .replace(/\b(lat|lng|lon|latitude|longitude)=-?\d{1,3}(?:\.\d+)?/giu, '$1=[place]');
}

interface EventLike {
  user?: unknown;
  request?: unknown;
  message?: string;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: unknown;
  contexts?: Record<string, unknown>;
  [key: string]: unknown;
}

/** What goes out for an error: its kind, message and stack, with the person and the place taken off. */
export function cleanEvent(event: EventLike): EventLike {
  const cleaned: EventLike = { ...event };
  delete cleaned.user;
  delete cleaned.request;
  delete cleaned.breadcrumbs;
  if (cleaned.message !== undefined) cleaned.message = scrub(cleaned.message);
  const values = cleaned.exception?.values;
  if (values !== undefined) {
    cleaned.exception = {
      ...cleaned.exception,
      values: values.map((v) => (v.value === undefined ? v : { ...v, value: scrub(v.value) })),
    };
  }
  return cleaned;
}

const defaultLoad = (): Promise<SentryLike> => import('@sentry/browser');

/** Starts crash reporting if a DSN was given at build time. Never throws: a failure here must not stop the app opening. */
export async function startCrashReporting(options: CrashReportingOptions = {}): Promise<boolean> {
  const dsn = 'dsn' in options ? options.dsn : import.meta.env.VITE_SENTRY_DSN;
  if (dsn === undefined || dsn === '') return false;
  try {
    const sentry = await (options.load ?? defaultLoad)();
    const build = typeof __BUILD__ === 'undefined' ? undefined : __BUILD__;
    sentry.init({
      dsn,
      release:
        options.release ?? `vayu@${APP_VERSION}${build === undefined ? '' : `+${build.commit}`}`,
      environment: options.environment ?? import.meta.env.MODE,
      sendDefaultPii: false,
      // Performance traces are off: they hold page addresses and every request the app makes.
      tracesSampleRate: 0,
      beforeBreadcrumb: () => null,
      beforeSend: (event: EventLike) => cleanEvent(event),
    });
    return true;
  } catch {
    return false;
  }
}
