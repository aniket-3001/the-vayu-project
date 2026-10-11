import { createHash } from 'node:crypto';
import { AssistantRequest } from '@vayu/contracts';
import type { Clock } from '@vayu/core';
import type { Generate } from '@vayu/watch';
import { answer, ASSISTANT_LIMITS } from './assistantAgent';
import type { Switch } from './killSwitch';
import { dayKey, type Quota } from './quota';
import { failure, ok, type ApiRequest, type ApiResponse } from './respond';

export interface AssistantDeps {
  readonly reword: Generate;
  readonly grounded: Generate;
  /** The kill switch. Off means no call to the model, and the app falls back to its own rules. */
  readonly enabled: Switch;
  readonly quota: Quota;
  readonly clock: Clock;
  readonly salt: string;
}

const DAY_SECONDS = 2 * 86_400;
const MAX_BODY = 4_000;

/**
 * `POST /v1/assistant`: a question and the facts the app already holds, answered in plain words. The model
 * only words an answer the rules decided, or answers from the given facts; it cannot act. Every call to the
 * model is counted against a limit for the caller and for the day, and a kill switch turns it off at once.
 * With the switch off or a limit reached the route says so with a status the app understands, and the app
 * answers from the same rules itself, so nothing stops working.
 */
export async function handleAssistant(
  request: ApiRequest,
  deps: AssistantDeps,
): Promise<ApiResponse> {
  if (request.method !== 'POST')
    return failure(405, 'method_not_allowed', `${request.method} is not supported here`);
  const body = request.body ?? '';
  if (body.length > MAX_BODY)
    return failure(413, 'too_large', 'That is too long for the assistant.');
  let raw: unknown;
  try {
    raw = JSON.parse(body === '' ? '{}' : body);
  } catch {
    return failure(400, 'invalid_body', 'The request body is not valid JSON');
  }
  const parsed = AssistantRequest.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return failure(
      400,
      'invalid_request',
      first?.message ?? 'The request is not valid',
      first === undefined || first.path.length === 0 ? undefined : first.path.join('.'),
    );
  }

  if (!(await deps.enabled()))
    return failure(503, 'assistant_off', 'The assistant is switched off right now.');

  const now = deps.clock.now();
  const day = dayKey(now);
  const caller = createHash('sha256')
    .update(`${deps.salt}|${day}|${request.sourceIp ?? 'unknown'}`)
    .digest('hex')
    .slice(0, 16);
  if (
    !(await deps.quota.take(
      `assistant#caller#${day}#${caller}`,
      ASSISTANT_LIMITS.perCallerPerDay,
      DAY_SECONDS,
    ))
  )
    return failure(429, 'too_many_requests', 'You have used today’s questions for the assistant.');
  if (!(await deps.quota.take(`assistant#all#${day}`, ASSISTANT_LIMITS.perDay, DAY_SECONDS)))
    return failure(429, 'busy', 'The assistant has reached its limit for today.');

  const reply = await answer({
    question: parsed.data.question,
    context: parsed.data.context,
    ...(parsed.data.lang === undefined ? {} : { lang: parsed.data.lang }),
    reword: deps.reword,
    grounded: deps.grounded,
  });
  return ok(reply);
}
