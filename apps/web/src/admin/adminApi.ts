export interface DayStats {
  readonly sessions: number;
  readonly users: number;
  readonly activeSeconds: number;
  readonly errors: number;
  readonly features: Readonly<Record<string, number>>;
}
export interface DaySummary extends DayStats {
  readonly day: string;
}
export interface GroupRow extends DayStats {
  readonly value: string;
}
export interface AccountRow {
  readonly userId: string;
  readonly email: string;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly sessions: number;
  readonly platform: string;
  readonly appVersion: string;
  readonly region: string;
  readonly firstPlaceAt?: string;
}
export interface TimelineEvent {
  readonly at: string;
  readonly kind: string;
  readonly detail: string;
  readonly n: number;
}
export interface ErrorRow {
  readonly at: string;
  readonly detail: string;
  readonly platform: string;
  readonly appVersion: string;
  readonly region: string;
}

/** Of the devices old enough to tell, how many came back. */
export interface Rate {
  readonly eligible: number;
  readonly returned: number;
}
/** The devices first seen in one week, and what became of them. */
export interface JourneyCohort {
  readonly week: string;
  readonly size: number;
  readonly signedIn: number;
  readonly milestones: Readonly<Record<string, number>>;
  readonly d1: Rate;
  readonly d7: Rate;
  readonly d30: Rate;
}

export type GroupBy = 'platform' | 'version' | 'region' | 'auth' | 'visitor' | 'band';

export interface AdminApi {
  /** Resolves only for an admin; rejects for anyone else, signed in or not. */
  readonly whoami: () => Promise<void>;
  readonly summary: (days: number) => Promise<readonly DaySummary[]>;
  readonly groups: (by: GroupBy, days: number) => Promise<readonly GroupRow[]>;
  readonly journey: (weeks: number) => Promise<readonly JourneyCohort[]>;
  readonly users: () => Promise<readonly AccountRow[]>;
  readonly user: (id: string) => Promise<{ user: AccountRow; events: readonly TimelineEvent[] }>;
  readonly errors: () => Promise<readonly ErrorRow[]>;
}

/** The admin calls, with the person's token. The server decides who is an admin; nothing here does. */
export function createAdminApi(
  baseUrl: string,
  getToken: () => Promise<string>,
  fetchImpl: typeof fetch = fetch,
): AdminApi {
  const root = baseUrl.replace(/\/+$/u, '');
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetchImpl(`${root}/v1/admin/${path}`, {
      headers: { authorization: `Bearer ${await getToken()}` },
    });
    if (!res.ok) throw new Error(`Admin answered ${String(res.status)}`);
    return (await res.json()) as T;
  };
  return {
    whoami: async () => {
      await get('whoami');
    },
    summary: async (days) => (await get<{ days: DaySummary[] }>(`summary?days=${String(days)}`)).days,
    groups: async (by, days) =>
      (await get<{ rows: GroupRow[] }>(`groups?by=${by}&days=${String(days)}`)).rows,
    journey: async (weeks) =>
      (await get<{ cohorts: JourneyCohort[] }>(`journey?weeks=${String(weeks)}`)).cohorts,
    users: async () => (await get<{ users: AccountRow[] }>('users')).users,
    user: (id) => get(`users/${encodeURIComponent(id)}`),
    errors: async () => (await get<{ errors: ErrorRow[] }>('errors')).errors,
  };
}
