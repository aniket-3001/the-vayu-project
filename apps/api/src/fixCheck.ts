import { rules, type FixCheckResult } from '@vayu/contracts';
import { fixOutcome, toMs, verdictForObservation, type FixOutcome } from '@vayu/core';
import { observeRoom, type RoomsDeps } from './observeRoom';

/** Where "did it work?" answers are kept. In AWS this is the Watch table; in tests it is memory. */
export interface FixCheckStore {
  /** Keeps a new record. `exists` when one with this id is already there (the same run asked for twice). */
  create(result: FixCheckResult): Promise<'created' | 'exists'>;
  get(fixCheckId: string): Promise<FixCheckResult | undefined>;
  save(result: FixCheckResult): Promise<void>;
}

/** What the workflow carries from one step to the next. */
export interface FixCheckState {
  readonly fixCheckId: string;
  readonly roomId: string;
  readonly placeId: string;
  readonly waitSeconds: number;
  readonly triesLeft: number;
  readonly baselinePm25: number | null;
  /** The last look's answer, once there has been one. */
  readonly outcome?: FixOutcome;
}

interface StepDeps {
  readonly rooms: RoomsDeps;
  readonly store: FixCheckStore;
  readonly now: () => string;
}

const BUCKET_MS = 10 * 60_000;
/** After a fix, only the last few minutes say how the room is now; the usual 30 minutes would still hold the air from before. */
const LOOK_WINDOW_MS = 5 * 60_000;

async function mustGet(store: FixCheckStore, id: string): Promise<FixCheckResult> {
  const found = await store.get(id);
  if (found === undefined) throw new Error(`No FixCheck record for ${id}`);
  return found;
}

/**
 * The three steps of FixCheck, as plain functions of their dependencies:
 * `baseline` (where the room is now), `verify` (where it is after the wait, and whether that
 * counts as improved), and `record` (the final answer). The state machine owns the waiting.
 */
export function createFixCheckSteps(deps: StepDeps): {
  baseline: (state: FixCheckState) => Promise<FixCheckState>;
  verify: (state: FixCheckState) => Promise<FixCheckState>;
  record: (state: FixCheckState) => Promise<FixCheckResult>;
} {
  return {
    async baseline(state) {
      const at = deps.now();
      const observation = await observeRoom(state.roomId, state.placeId, at, deps.rooms, {
        windowMs: LOOK_WINDOW_MS,
      });
      const record = await mustGet(deps.store, state.fixCheckId);
      await deps.store.save({
        ...record,
        baselinePm25: observation.insidePm25,
        latestPm25: observation.insidePm25,
        simulated: observation.simulated,
      });
      return { ...state, baselinePm25: observation.insidePm25 };
    },

    async verify(state) {
      const at = deps.now();
      const record = await mustGet(deps.store, state.fixCheckId);
      // Only readings taken since the run started, so the number cannot still hold the air from before.
      const observation = await observeRoom(state.roomId, state.placeId, at, deps.rooms, {
        windowMs: LOOK_WINDOW_MS,
        after: record.startedAt,
      });
      const verdict = verdictForObservation(observation);
      const { outcome, dropPct } = fixOutcome({
        baselinePm25: state.baselinePm25,
        insidePm25: observation.insidePm25,
        verdict,
      });
      await deps.store.save({
        ...record,
        latestPm25: observation.insidePm25,
        dropPct,
        tries: record.tries + 1,
        simulated: record.simulated || observation.simulated,
      });
      return { ...state, outcome, triesLeft: state.triesLeft - 1 };
    },

    async record(state) {
      const record = await mustGet(deps.store, state.fixCheckId);
      // If it never improved, say what the last look found: it did not work, or we could not tell.
      const status = state.outcome ?? 'not_sure';
      const final: FixCheckResult = {
        ...record,
        status,
        // Anything short of "it worked" is flagged so a person can be told.
        escalate: status !== 'improved',
        finishedAt: deps.now(),
      };
      await deps.store.save(final);
      return final;
    },
  };
}

export type StartOutcome =
  | { readonly kind: 'started'; readonly fixCheckId: string }
  | { readonly kind: 'exists'; readonly fixCheckId: string }
  | {
      readonly kind: 'refused';
      readonly code: 'bad_parameter' | 'room_not_reporting';
      readonly message: string;
      readonly param?: string;
    };

export interface StartDeps extends StepDeps {
  /** Starts the state machine. The name is the id, so a repeated start of the same run is refused by AWS too. */
  readonly startExecution: (name: string, input: FixCheckState) => Promise<void>;
}

/**
 * Starts a "did it work?" run for a room. It is refused for a room that is not reporting (so nobody
 * can start runs for names that do not exist), for a wait outside the rule, and it is safe to ask
 * twice: within ten minutes the same room gets the same run back.
 */
export async function startFixCheck(
  input: { readonly roomId: string; readonly placeId: string; readonly waitSeconds: number },
  deps: StartDeps,
): Promise<StartOutcome> {
  const { minWaitSeconds, maxWaitSeconds, maxTries } = rules.fixCheck;
  if (
    !Number.isInteger(input.waitSeconds) ||
    input.waitSeconds < minWaitSeconds ||
    input.waitSeconds > maxWaitSeconds
  ) {
    return {
      kind: 'refused',
      code: 'bad_parameter',
      message: `waitSeconds must be a whole number from ${String(minWaitSeconds)} to ${String(maxWaitSeconds)}`,
      param: 'waitSeconds',
    };
  }
  const at = deps.now();
  const observation = await observeRoom(input.roomId, input.placeId, at, deps.rooms);
  if (observation.insidePm25 === null) {
    return {
      kind: 'refused',
      code: 'room_not_reporting',
      message: 'This room has no recent reading, so there is nothing to compare against',
    };
  }

  const fixCheckId = `${input.roomId}-${String(Math.floor(toMs(at) / BUCKET_MS))}`;
  const created = await deps.store.create({
    fixCheckId,
    roomId: input.roomId,
    startedAt: at,
    status: 'waiting',
    baselinePm25: observation.insidePm25,
    latestPm25: observation.insidePm25,
    dropPct: null,
    tries: 0,
    escalate: false,
    simulated: observation.simulated,
  });
  if (created === 'exists') return { kind: 'exists', fixCheckId };

  try {
    await deps.startExecution(fixCheckId, {
      fixCheckId,
      roomId: input.roomId,
      placeId: input.placeId,
      waitSeconds: input.waitSeconds,
      triesLeft: maxTries,
      baselinePm25: null,
    });
  } catch (error) {
    // Never leave a record that says "waiting" for a run that is not going to happen.
    const record = await deps.store.get(fixCheckId);
    if (record !== undefined) {
      await deps.store.save({ ...record, status: 'not_sure', finishedAt: deps.now() });
    }
    throw error;
  }
  return { kind: 'started', fixCheckId };
}
