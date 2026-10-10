export const FIRE_REPORTS_STORAGE_KEY = 'vayu.fireReports.v1';

/** What a person tells us about a fire: where it is, and anything they want to add. */
export interface FireReportDraft {
  readonly lat: number;
  readonly lng: number;
  /** For a fire seen on the map: how long ago the satellite saw it. */
  readonly hoursAgo?: number;
  /** For a fire seen on the map: how fierce it was, in megawatts. */
  readonly frp?: number;
  readonly note?: string;
}

export const FIRE_REPORT_WORDS =
  'We keep each report so a person can check it. It is not sent to any agency.';

export type FireReportSent = 'sent' | 'saved';

/**
 * Sends the report to our API (`POST {base}/v1/fire-reports`). With no address (the prototype and the tests) it is
 * kept on this device only. If the API cannot be reached, or refuses, this throws with words for the person: a
 * report is never called sent when it was not.
 */
export async function submitFireReport(
  draft: FireReportDraft,
  options: {
    readonly baseUrl?: string | undefined;
    readonly fetchImpl?: typeof fetch;
    readonly storage?: Storage;
    readonly now?: () => Date;
  } = {},
): Promise<FireReportSent> {
  const note = draft.note?.trim() ?? '';
  const report = {
    lat: Math.round(draft.lat * 10_000) / 10_000,
    lng: Math.round(draft.lng * 10_000) / 10_000,
    ...(draft.hoursAgo === undefined ? {} : { hoursAgo: Math.max(0, Math.round(draft.hoursAgo)) }),
    ...(draft.frp === undefined ? {} : { frp: Math.round(draft.frp * 10) / 10 }),
    ...(note === '' ? {} : { note: note.slice(0, 200) }),
    sentAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  const base = options.baseUrl;
  if (base !== undefined) {
    let res: Response;
    try {
      res = await (options.fetchImpl ?? fetch)(`${base.replace(/\/$/u, '')}/v1/fire-reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(report),
      });
    } catch {
      throw new Error('We could not reach the server. Please check your connection and try again.');
    }
    if (res.ok) return 'sent';
    let message = 'That did not go through. Please try again in a moment.';
    try {
      const body = (await res.json()) as { error?: { message?: unknown } };
      if (typeof body.error?.message === 'string') message = body.error.message;
    } catch {
      // The general message stands.
    }
    throw new Error(message);
  }
  try {
    const storage = options.storage ?? window.localStorage;
    const raw = storage.getItem(FIRE_REPORTS_STORAGE_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    const kept: readonly unknown[] = Array.isArray(parsed) ? (parsed as unknown[]) : [];
    storage.setItem(FIRE_REPORTS_STORAGE_KEY, JSON.stringify([...kept, report]));
  } catch {
    // Best effort.
  }
  return 'saved';
}

/** The words for a report that went through, with what it does and does not do. */
export const sentWords = (how: FireReportSent): string =>
  how === 'sent'
    ? `Thank you. Your report is saved. ${FIRE_REPORT_WORDS}`
    : `Saved on this device only, since this is a sample. ${FIRE_REPORT_WORDS}`;
