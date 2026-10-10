import { Logger } from '@aws-lambda-powertools/logger';
import { z } from 'zod';
import { createFixCheckSteps, type FixCheckState } from './fixCheck';
import { fixCheckStore, roomsDeps } from './fixCheckWiring';

const logger = new Logger({ serviceName: 'vayu-fixcheck' });

const State = z.object({
  fixCheckId: z.string().min(1),
  roomId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  placeId: z.string().min(1),
  waitSeconds: z.number().int().positive(),
  triesLeft: z.number().int().nonnegative(),
  baselinePm25: z.number().nullable(),
  outcome: z.enum(['improved', 'not_improved', 'not_sure']).optional(),
});

/** What the state machine sends: which step, and the state it carries. Anything else is refused. */
export const StepEvent = z.object({
  step: z.enum(['baseline', 'verify', 'record']),
  state: State,
});

export async function handler(event: unknown): Promise<unknown> {
  const { step, state } = StepEvent.parse(event);
  const steps = createFixCheckSteps({
    rooms: roomsDeps(),
    store: fixCheckStore(),
    now: () => new Date().toISOString(),
  });
  const { outcome, ...rest } = state;
  const carried: FixCheckState = { ...rest, ...(outcome === undefined ? {} : { outcome }) };
  const out = await steps[step](carried);
  logger.info('fixcheck', { step, fixCheckId: state.fixCheckId });
  return out;
}
