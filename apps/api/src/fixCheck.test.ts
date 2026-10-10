import { rules, type FixCheckResult, type Reading } from '@vayu/contracts';
import { type StationSnapshot } from '@vayu/data';
import { describe, expect, it } from 'vitest';
import {
  createFixCheckSteps,
  startFixCheck,
  type FixCheckState,
  type FixCheckStore,
} from './fixCheck';
import type { RoomsDeps } from './observeRoom';

const T0 = Date.parse('2026-10-08T10:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();

const harvested: StationSnapshot = {
  schemaVersion: 1,
  harvestedAt: iso(T0),
  placeId: 'school',
  status: 'fresh',
  hours: [{ hourStart: '2026-10-08T08:00:00.000Z', pm25: 130, pm10: null }], // ended 09:00, observed 1 h before T0
};

/** A world with a clock we can move, readings we can add, and a store we can look in. */
function world(): {
  now: { ms: number };
  readings: Reading[];
  rooms: RoomsDeps;
  saved: Map<string, FixCheckResult>;
  store: FixCheckStore;
  addReading: (pm25: number, simulated?: boolean) => void;
} {
  const now = { ms: T0 };
  const readings: Reading[] = [];
  const saved = new Map<string, FixCheckResult>();
  return {
    now,
    readings,
    saved,
    addReading: (pm25, simulated = false) => {
      readings.push({
        schemaVersion: 1,
        id: `dev#${iso(now.ms)}#${readings.length}`,
        thingId: 'dev',
        ts: iso(now.ms),
        pm25,
        pm10: pm25 * 1.5,
        rhPct: 50,
        flags: simulated ? ['simulated'] : [],
        simulated,
      });
    },
    rooms: {
      store: {
        putReading: () => Promise.resolve('stored'),
        readingsSince: (_thing, since) =>
          Promise.resolve(readings.filter((r) => r.ts >= since).reverse()),
      },
      cache: {
        latest: () => Promise.resolve(harvested),
        latestForecast: () => Promise.resolve(undefined),
      },
    },
    store: {
      create: (result) => {
        if (saved.has(result.fixCheckId)) return Promise.resolve('exists');
        saved.set(result.fixCheckId, result);
        return Promise.resolve('created');
      },
      get: (id) => Promise.resolve(saved.get(id)),
      save: (result) => {
        saved.set(result.fixCheckId, result);
        return Promise.resolve();
      },
    },
  };
}

const state = (over: Partial<FixCheckState> = {}): FixCheckState => ({
  fixCheckId: 'dev-1',
  roomId: 'dev',
  placeId: 'school',
  waitSeconds: 300,
  triesLeft: rules.fixCheck.maxTries,
  baselinePm25: null,
  ...over,
});

/** The record the start step leaves behind, then the steps over the same world. */
async function setup(w: ReturnType<typeof world>): Promise<ReturnType<typeof createFixCheckSteps>> {
  await w.store.create({
    fixCheckId: 'dev-1',
    roomId: 'dev',
    startedAt: iso(T0),
    status: 'waiting',
    baselinePm25: null,
    latestPm25: null,
    dropPct: null,
    tries: 0,
    escalate: false,
    simulated: false,
  });
  return createFixCheckSteps({ rooms: w.rooms, store: w.store, now: () => iso(w.now.ms) });
}

describe('FixCheck steps', () => {
  it('baseline reads the room now and keeps it as the starting point', async () => {
    const w = world();
    w.addReading(200);
    const steps = await setup(w);
    const out = await steps.baseline(state());
    expect(out.baselinePm25).toBe(200);
    expect(w.saved.get('dev-1')).toMatchObject({
      status: 'waiting',
      baselinePm25: 200,
      tries: 0,
      escalate: false,
    });
  });

  it('verify, after the wait, says improved when the room fell and is clearly cleaner than outside', async () => {
    const w = world();
    w.addReading(200);
    const steps = await setup(w);
    const started = await steps.baseline(state());
    w.now.ms += 300_000;
    w.addReading(90);
    const out = await steps.verify(started);
    expect(out).toMatchObject({ outcome: 'improved', triesLeft: rules.fixCheck.maxTries - 1 });
    expect(w.saved.get('dev-1')).toMatchObject({ latestPm25: 90, tries: 1 });
  });

  it('verify says not improved when the room has barely moved, and keeps the tries it has left', async () => {
    const w = world();
    w.addReading(200);
    const steps = await setup(w);
    const started = await steps.baseline(state());
    w.now.ms += 300_000;
    w.addReading(195);
    expect(await steps.verify(started)).toMatchObject({ outcome: 'not_improved', triesLeft: 2 });
  });

  it('verify says not sure when the unit has gone quiet', async () => {
    const w = world();
    w.addReading(200);
    const steps = await setup(w);
    const started = await steps.baseline(state());
    w.now.ms += 20 * 60_000; // twenty minutes, no new reading
    expect(await steps.verify(started)).toMatchObject({ outcome: 'not_sure' });
  });

  it('record writes the final answer: improved is done, and nobody needs telling', async () => {
    const w = world();
    w.addReading(200);
    const steps = await setup(w);
    const started = await steps.baseline(state());
    w.now.ms += 300_000;
    w.addReading(90);
    const verified = await steps.verify(started);
    const result = await steps.record(verified);
    expect(result).toMatchObject({ status: 'improved', escalate: false, dropPct: 55 });
    expect(result.finishedAt).toBe(iso(w.now.ms));
  });

  it('record, when the tries are used up without an improvement, says so and flags it for a person', async () => {
    const w = world();
    w.addReading(200);
    const steps = await setup(w);
    let current = await steps.baseline(state());
    for (let i = 0; i < rules.fixCheck.maxTries; i++) {
      w.now.ms += 300_000;
      w.addReading(198);
      current = await steps.verify(current);
    }
    expect(current.triesLeft).toBe(0);
    expect(await steps.record(current)).toMatchObject({
      status: 'not_improved',
      escalate: true,
      tries: rules.fixCheck.maxTries,
    });
  });

  it('carries "simulated" through to the answer, so a dev-publisher run cannot pass for a real one', async () => {
    const w = world();
    w.addReading(200, true);
    const steps = await setup(w);
    const started = await steps.baseline(state());
    w.now.ms += 300_000;
    w.addReading(90, true);
    const result = await steps.record(await steps.verify(started));
    expect(result.simulated).toBe(true);
  });
});

describe('startFixCheck', () => {
  const build = (
    w: ReturnType<typeof world>,
  ): { started: { name: string; input: unknown }[]; deps: Parameters<typeof startFixCheck>[1] } => {
    const started: { name: string; input: unknown }[] = [];
    return {
      started,
      deps: {
        rooms: w.rooms,
        store: w.store,
        now: () => iso(w.now.ms),
        startExecution: (name, input) => {
          started.push({ name, input });
          return Promise.resolve();
        },
      },
    };
  };

  it('starts one run for a room that is reporting, and answers with its id', async () => {
    const w = world();
    w.addReading(200);
    const { started, deps } = build(w);
    const out = await startFixCheck({ roomId: 'dev', placeId: 'school', waitSeconds: 300 }, deps);
    expect(out).toMatchObject({ kind: 'started' });
    expect(started).toHaveLength(1);
    expect(started[0]?.input).toMatchObject({
      roomId: 'dev',
      waitSeconds: 300,
      triesLeft: rules.fixCheck.maxTries,
    });
    expect(w.saved.size).toBe(1);
  });

  it('is safe to ask twice within ten minutes: the same run, not a second one', async () => {
    const w = world();
    w.addReading(200);
    const { started, deps } = build(w);
    const first = await startFixCheck({ roomId: 'dev', placeId: 'school', waitSeconds: 300 }, deps);
    w.now.ms += 60_000;
    const second = await startFixCheck(
      { roomId: 'dev', placeId: 'school', waitSeconds: 300 },
      deps,
    );
    expect(second).toMatchObject({
      kind: 'exists',
      fixCheckId: first.kind === 'started' ? first.fixCheckId : '',
    });
    expect(started).toHaveLength(1);
  });

  it('refuses a room that has not reported (no free runs for names that do not exist)', async () => {
    const w = world();
    const { started, deps } = build(w);
    expect(
      await startFixCheck({ roomId: 'ghost', placeId: 'school', waitSeconds: 300 }, deps),
    ).toMatchObject({
      kind: 'refused',
      code: 'room_not_reporting',
    });
    expect(started).toHaveLength(0);
    expect(w.saved.size).toBe(0);
  });

  it.each([
    [rules.fixCheck.minWaitSeconds - 1],
    [rules.fixCheck.maxWaitSeconds + 1],
    [Number.NaN],
    [12.5],
  ])('refuses a wait of %s seconds', async (waitSeconds) => {
    const w = world();
    w.addReading(200);
    const { started, deps } = build(w);
    expect(
      await startFixCheck({ roomId: 'dev', placeId: 'school', waitSeconds }, deps),
    ).toMatchObject({
      kind: 'refused',
      code: 'bad_parameter',
      param: 'waitSeconds',
    });
    expect(started).toHaveLength(0);
  });

  it('does not leave a waiting record behind if the workflow could not be started', async () => {
    const w = world();
    w.addReading(200);
    const { deps } = build(w);
    const failing = {
      ...deps,
      startExecution: () => Promise.reject(new Error('Step Functions is down')),
    };
    await expect(
      startFixCheck({ roomId: 'dev', placeId: 'school', waitSeconds: 300 }, failing),
    ).rejects.toThrow('down');
    expect([...w.saved.values()].every((r) => r.status !== 'waiting')).toBe(true);
  });
});
