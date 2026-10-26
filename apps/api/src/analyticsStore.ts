import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  BATCH_DIMENSIONS,
  cityOf,
  MILESTONES,
  milestoneOf,
  type Band,
  type Batch,
  type Dimension,
} from './analyticsModel';
import { dayKey } from './quota';
import { traced } from './tracing';

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
/** `users` here counts active people per day, added up over the days asked for, so one person on two days counts twice. */
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
/** The devices first seen in one week (Monday to Sunday, India time), and what became of them. */
export interface JourneyCohort {
  readonly week: string;
  readonly size: number;
  readonly signedIn: number;
  /** How many of them reached each milestone. */
  readonly milestones: Readonly<Record<string, number>>;
  /** Came back the day after the first visit. */
  readonly d1: Rate;
  /** Came back on any of the next 7 days. */
  readonly d7: Rate;
  /** Came back on any of the next 30 days. */
  readonly d30: Rate;
}

export interface AnalyticsStore {
  record(args: {
    batch: Batch;
    userId?: string;
    email?: string;
    now: string;
  }): Promise<void>;
  summary(days: number, now: string): Promise<DaySummary[]>;
  /**
   * One row per value of `by`. For `band`, `sessions` is the sessions that saw that AQI band and the other figures are
   * what happened while it was showing, so "actions per session" can be compared between bands.
   */
  groups(by: Dimension, days: number, now: string): Promise<GroupRow[]>;
  /** New devices by week of first visit, newest week first: what they did first and whether they came back. */
  journey(weeks: number, now: string): Promise<JourneyCohort[]>;
  accounts(limit: number): Promise<AccountRow[]>;
  account(
    userId: string,
    limit: number,
  ): Promise<{ row: AccountRow; events: TimelineEvent[] } | undefined>;
  errors(limit: number, now: string): Promise<ErrorRow[]>;
  removeUser(userId: string): Promise<void>;
}

type Item = Record<string, unknown>;

/** The few table operations the store needs, so the logic is written once and tested without AWS. */
export interface Backend {
  add(pk: string, sk: string, delta: number, expiresAt: number): Promise<void>;
  putIfAbsent(pk: string, sk: string, item: Item, expiresAt: number): Promise<boolean>;
  put(pk: string, sk: string, item: Item, expiresAt: number): Promise<void>;
  get(pk: string, sk: string): Promise<Item | undefined>;
  query(pk: string, opts?: { descending?: boolean; limit?: number }): Promise<Item[]>;
  remove(pk: string, sk: string): Promise<void>;
}

const DAY_SECONDS = 86_400;
const COUNTER_TTL_DAYS = 400;
const EVENT_TTL_DAYS = 90;
const ERROR_TTL_DAYS = 30;
export const MAX_DAYS = 90;
export const MAX_WEEKS = 13;
const COHORT_DAYS_KEPT = 120;

const num = (x: unknown): number => (typeof x === 'number' ? x : 0);
const str = (x: unknown, fallback = ''): string => (typeof x === 'string' ? x : fallback);

const emptyStats = (): { -readonly [K in keyof DayStats]: DayStats[K] } & {
  features: Record<string, number>;
} => ({ sessions: 0, users: 0, activeSeconds: 0, errors: 0, features: {} });

/** Adds one counter row (`metric`, `count`) into a running total. */
function fold(stats: ReturnType<typeof emptyStats>, metric: string, count: number): void {
  if (metric === 'sessions') stats.sessions += count;
  else if (metric === 'users') stats.users += count;
  else if (metric === 'active_seconds') stats.activeSeconds += count;
  else if (metric === 'errors') stats.errors += count;
  else if (metric.includes(':')) stats.features[metric] = (stats.features[metric] ?? 0) + count;
}

/** A calendar day key moved by whole days. The keys are plain dates, so this is calendar arithmetic, not clock time. */
function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_SECONDS * 1000).toISOString().slice(0, 10);
}

/** The Monday of the week a day key falls in. */
function mondayOf(key: string): string {
  const weekday = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 is Sunday
  return addDays(key, -((weekday + 6) % 7));
}

const strings = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [];

/** Day keys, newest last, for the `days` days ending at `now` (India calendar). */
function lastDays(days: number, now: string): string[] {
  const n = Math.min(Math.max(Math.trunc(days), 1), MAX_DAYS);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(dayKey(new Date(Date.parse(now) - i * DAY_SECONDS * 1000).toISOString()));
  return out;
}

export function createAnalyticsStore(backend: Backend): AnalyticsStore {
  const accountRow = (item: Item): AccountRow => ({
    userId: str(item.sk),
    email: str(item.email),
    firstSeen: str(item.firstSeen),
    lastSeen: str(item.lastSeen),
    sessions: num(item.sessions),
    platform: str(item.platform),
    appVersion: str(item.appVersion),
    region: str(item.region),
    ...(typeof item.firstPlaceAt === 'string' ? { firstPlaceAt: item.firstPlaceAt } : {}),
  });

  return {
    async record({ batch, userId, email, now }) {
      const day = dayKey(now);
      const nowSeconds = Math.floor(Date.parse(now) / 1000);
      const counterTtl = nowSeconds + COUNTER_TTL_DAYS * DAY_SECONDS;
      const eventTtl = nowSeconds + EVENT_TTL_DAYS * DAY_SECONDS;
      const errorTtl = nowSeconds + ERROR_TTL_DAYS * DAY_SECONDS;
      const { device } = batch;

      const profile = await backend.get(`DEV#${batch.deviceId}`, 'PROFILE');
      const firstDay = str(profile?.firstSeenDay, day);
      const region = device.cell ? cityOf(device.cell.lat, device.cell.lng) : str(profile?.region, 'Unknown');
      const values: Record<(typeof BATCH_DIMENSIONS)[number], string> = {
        all: 'all',
        platform: device.platform,
        version: device.appVersion,
        region,
        auth: userId === undefined ? 'anonymous' : 'signed_in',
        visitor: firstDay < day ? 'returning' : 'new',
      };

      const increments = new Map<string, number>();
      const add = (sk: string, by: number): void => {
        increments.set(sk, (increments.get(sk) ?? 0) + by);
      };
      // `band` is the AQI band showing when it happened. People and sessions are not counted by it (a person is in
      // several bands over a day); sessions get their own count from `context` events, below.
      const bump = (metric: string, by: number, band?: Band): void => {
        for (const dim of BATCH_DIMENSIONS) add(`${dim}#${values[dim]}#${metric}`, by);
        if (band !== undefined && metric !== 'sessions' && metric !== 'users')
          add(`band#${band}#${metric}`, by);
      };

      let sessions = 0;
      let firstPlaceAt = typeof profile?.firstPlaceAt === 'string' ? profile.firstPlaceAt : undefined;
      let seq = 0;
      for (const event of batch.events) {
        if (event.kind === 'session_start') {
          sessions += 1;
          bump('sessions', 1);
        } else if (event.kind === 'context') {
          // This session saw the air in this band.
          add(`band#${event.detail}#sessions`, 1);
        } else if (event.kind === 'active') bump('active_seconds', event.n, event.band);
        else if (event.kind === 'error') {
          bump('errors', event.n, event.band);
          seq += 1;
          await backend.put(
            `ERR#${day}`,
            `${event.at}#${batch.sessionId.slice(0, 8)}#${String(seq)}`,
            { detail: event.detail, platform: device.platform, appVersion: device.appVersion, region },
            errorTtl,
          );
        } else if (event.kind === 'api') bump('api_issues:count', event.n, event.band);
        else bump(`${event.kind}:${event.detail}`, event.n, event.band);
        if (event.kind === 'feature' && event.detail === 'add_place' && firstPlaceAt === undefined)
          firstPlaceAt = event.at;
      }

      // A device is one active person for the day: only its first write of the day counts.
      const first = await backend.putIfAbsent(`ACTIVE#${day}`, batch.deviceId, {}, counterTtl);
      if (first) bump('users', 1);
      for (const [sk, by] of increments) await backend.add(`STAT#${day}`, sk, by, counterTtl);

      await backend.put(
        `DEV#${batch.deviceId}`,
        'PROFILE',
        {
          firstSeen: str(profile?.firstSeen, now),
          firstSeenDay: firstDay,
          lastSeen: now,
          sessions: num(profile?.sessions) + sessions,
          platform: device.platform,
          appVersion: device.appVersion,
          os: device.os,
          model: device.model,
          screen: device.screen,
          lang: device.lang,
          region,
          ...(firstPlaceAt === undefined ? {} : { firstPlaceAt }),
        },
        counterTtl,
      );

      // The device's place in its first-day cohort: what it reached first, and the days it was around.
      const cohortKey = `COHORT#${firstDay}`;
      const seen = await backend.get(cohortKey, batch.deviceId);
      const reached: Record<string, string> = {
        ...(typeof seen?.m === 'object' && seen.m !== null ? (seen.m as Record<string, string>) : {}),
      };
      for (const event of batch.events) {
        const milestone = milestoneOf(event.kind, event.detail);
        if (milestone !== undefined && reached[milestone] === undefined) reached[milestone] = event.at;
      }
      if (userId !== undefined && reached.first_signed_in === undefined) reached.first_signed_in = now;
      const daysAround = strings(seen?.days);
      if (!daysAround.includes(day)) daysAround.push(day);
      await backend.put(
        cohortKey,
        batch.deviceId,
        {
          m: reached,
          days: daysAround.sort().slice(-COHORT_DAYS_KEPT),
          signedIn: seen?.signedIn === true || userId !== undefined,
          // Seen before cohorts existed: its early days are unknown, so it is left out of the journey figures.
          legacy: seen === undefined ? profile !== undefined : seen.legacy === true,
          platform: device.platform,
        },
        counterTtl,
      );

      if (userId !== undefined) {
        const row = await backend.get('USERS', userId);
        await backend.put(
          'USERS',
          userId,
          {
            email: email ?? str(row?.email),
            firstSeen: str(row?.firstSeen, now),
            lastSeen: now,
            sessions: num(row?.sessions) + sessions,
            platform: device.platform,
            appVersion: device.appVersion,
            region,
            ...(firstPlaceAt === undefined ? {} : { firstPlaceAt }),
          },
          counterTtl,
        );
        let index = 0;
        for (const event of batch.events) {
          if (event.kind === 'active') continue;
          index += 1;
          await backend.put(
            `UEVT#${userId}`,
            `${event.at}#${batch.sessionId.slice(0, 8)}#${String(index).padStart(2, '0')}`,
            { kind: event.kind, detail: event.detail, n: event.n },
            eventTtl,
          );
        }
      }
    },

    async summary(days, now) {
      const out: DaySummary[] = [];
      for (const day of lastDays(days, now)) {
        const stats = emptyStats();
        for (const item of await backend.query(`STAT#${day}`))
          if (str(item.sk).startsWith('all#all#')) fold(stats, str(item.sk).slice(8), num(item.count));
        out.push({ day, ...stats });
      }
      return out;
    },

    async groups(by, days, now) {
      const rows = new Map<string, ReturnType<typeof emptyStats>>();
      for (const day of lastDays(days, now))
        for (const item of await backend.query(`STAT#${day}`)) {
          const [dim, value, metric] = str(item.sk).split('#');
          if (dim !== by || value === undefined || metric === undefined) continue;
          const stats = rows.get(value) ?? emptyStats();
          fold(stats, metric, num(item.count));
          rows.set(value, stats);
        }
      return [...rows].map(([value, stats]) => ({ value, ...stats })).sort((a, b) => b.sessions - a.sessions);
    },

    async journey(weeks, now) {
      const today = dayKey(now);
      const count = Math.min(Math.max(Math.trunc(weeks), 1), MAX_WEEKS);
      const thisMonday = mondayOf(today);
      const out: JourneyCohort[] = [];
      for (let w = 0; w < count; w += 1) {
        const monday = addDays(thisMonday, -7 * w);
        const reached: Record<string, number> = Object.fromEntries(MILESTONES.map((m) => [m, 0]));
        const d1 = { eligible: 0, returned: 0 };
        const d7 = { eligible: 0, returned: 0 };
        const d30 = { eligible: 0, returned: 0 };
        let size = 0;
        let signedIn = 0;
        for (let i = 0; i < 7; i += 1) {
          const first = addDays(monday, i);
          if (first > today) break;
          for (const item of await backend.query(`COHORT#${first}`)) {
            if (item.legacy === true) continue;
            size += 1;
            if (item.signedIn === true) signedIn += 1;
            const m = typeof item.m === 'object' && item.m !== null ? (item.m as Record<string, unknown>) : {};
            for (const name of MILESTONES) if (m[name] !== undefined) reached[name] = (reached[name] ?? 0) + 1;
            const daysAround = strings(item.days);
            // A window counts only once it has fully passed, so a figure never looks worse for being unfinished.
            const within = (target: { eligible: number; returned: number }, last: number): void => {
              if (addDays(first, last) >= today) return;
              target.eligible += 1;
              if (daysAround.some((d) => d > first && d <= addDays(first, last))) target.returned += 1;
            };
            if (addDays(first, 1) < today) {
              d1.eligible += 1;
              if (daysAround.includes(addDays(first, 1))) d1.returned += 1;
            }
            within(d7, 7);
            within(d30, 30);
          }
        }
        out.push({ week: monday, size, signedIn, milestones: reached, d1, d7, d30 });
      }
      return out;
    },

    async accounts(limit) {
      const items = await backend.query('USERS', { limit: Math.min(Math.max(limit, 1), 500) });
      return items.map(accountRow).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
    },

    async account(userId, limit) {
      const row = await backend.get('USERS', userId);
      if (row === undefined) return undefined;
      const events = await backend.query(`UEVT#${userId}`, { descending: true, limit });
      return {
        row: accountRow({ ...row, sk: userId }),
        events: events.map((e) => ({
          at: str(e.sk).split('#')[0] ?? '',
          kind: str(e.kind),
          detail: str(e.detail),
          n: num(e.n),
        })),
      };
    },

    async errors(limit, now) {
      const out: ErrorRow[] = [];
      for (const day of lastDays(ERROR_TTL_DAYS, now).reverse()) {
        if (out.length >= limit) break;
        for (const item of await backend.query(`ERR#${day}`, { descending: true, limit: limit - out.length }))
          out.push({
            at: str(item.sk).split('#')[0] ?? '',
            detail: str(item.detail),
            platform: str(item.platform),
            appVersion: str(item.appVersion),
            region: str(item.region),
          });
      }
      return out;
    },

    async removeUser(userId) {
      for (const item of await backend.query(`UEVT#${userId}`)) await backend.remove(`UEVT#${userId}`, str(item.sk));
      await backend.remove('USERS', userId);
    },
  };
}

/** Keeps everything in memory, for tests and local runs. */
export function memoryBackend(): Backend {
  const rows = new Map<string, Map<string, Item>>();
  const part = (pk: string): Map<string, Item> => {
    let p = rows.get(pk);
    if (p === undefined) rows.set(pk, (p = new Map<string, Item>()));
    return p;
  };
  return {
    add(pk, sk, delta) {
      const p = part(pk);
      const old = p.get(sk);
      p.set(sk, { pk, sk, count: num(old?.count) + delta });
      return Promise.resolve();
    },
    putIfAbsent(pk, sk, item) {
      const p = part(pk);
      if (p.has(sk)) return Promise.resolve(false);
      p.set(sk, { ...item, pk, sk });
      return Promise.resolve(true);
    },
    put(pk, sk, item) {
      part(pk).set(sk, { ...item, pk, sk });
      return Promise.resolve();
    },
    get: (pk, sk) => Promise.resolve(rows.get(pk)?.get(sk)),
    query(pk, opts = {}) {
      const all = [...(rows.get(pk)?.values() ?? [])].sort((a, b) => str(a.sk).localeCompare(str(b.sk)));
      if (opts.descending === true) all.reverse();
      return Promise.resolve(opts.limit === undefined ? all : all.slice(0, opts.limit));
    },
    remove(pk, sk) {
      rows.get(pk)?.delete(sk);
      return Promise.resolve();
    },
  };
}

export const memoryAnalyticsStore = (): AnalyticsStore => createAnalyticsStore(memoryBackend());

/** The same in the Watch table. Counters and markers carry `expiresAt`, so DynamoDB removes them on its own. */
export function dynamoBackend(
  tableName: string,
  client: DynamoDBDocumentClient = DynamoDBDocumentClient.from(traced(new DynamoDBClient({}))),
): Backend {
  return {
    async add(pk, sk, delta, expiresAt) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { pk, sk },
          UpdateExpression: 'ADD #c :d SET expiresAt = if_not_exists(expiresAt, :e)',
          ExpressionAttributeNames: { '#c': 'count' },
          ExpressionAttributeValues: { ':d': delta, ':e': expiresAt },
        }),
      );
    },
    async putIfAbsent(pk, sk, item, expiresAt) {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: { ...item, pk, sk, expiresAt },
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        );
        return true;
      } catch (error) {
        if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
        throw error;
      }
    },
    async put(pk, sk, item, expiresAt) {
      await client.send(new PutCommand({ TableName: tableName, Item: { ...item, pk, sk, expiresAt } }));
    },
    async get(pk, sk) {
      const out = await client.send(new GetCommand({ TableName: tableName, Key: { pk, sk } }));
      return out.Item;
    },
    async query(pk, opts = {}) {
      const items: Item[] = [];
      let start: Record<string, unknown> | undefined;
      do {
        const out = await client.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'pk = :pk',
            ExpressionAttributeValues: { ':pk': pk },
            ScanIndexForward: opts.descending !== true,
            ...(opts.limit === undefined ? {} : { Limit: opts.limit - items.length }),
            ...(start === undefined ? {} : { ExclusiveStartKey: start }),
          }),
        );
        items.push(...((out.Items ?? []) as Item[]));
        start = out.LastEvaluatedKey;
      } while (start !== undefined && (opts.limit === undefined || items.length < opts.limit));
      return items;
    },
    async remove(pk, sk) {
      await client.send(new DeleteCommand({ TableName: tableName, Key: { pk, sk } }));
    },
  };
}

export const dynamoAnalyticsStore = (
  tableName: string,
  client?: DynamoDBDocumentClient,
): AnalyticsStore => createAnalyticsStore(dynamoBackend(tableName, client));
