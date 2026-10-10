import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { traced } from './tracing';

/** A switch somebody can flip without a deploy: on only for the exact value `true`, and off on any doubt. */
export type Switch = () => Promise<boolean>;

/**
 * Reads an SSM parameter as a switch. It is on only when the parameter says exactly `true`; a missing
 * parameter, an error or a timeout all read as off (fail closed). The answer is kept for a minute so a busy
 * route does not call SSM on every request, which also means a flip takes up to a minute to bite.
 */
export function ssmSwitch(
  name: string,
  client: Pick<SSMClient, 'send'> = traced(new SSMClient({})),
  ttlMs = 60_000,
  nowMs: () => number = Date.now,
): Switch {
  let last: { at: number; on: boolean } | undefined;
  return async () => {
    if (last !== undefined && nowMs() - last.at < ttlMs) return last.on;
    let on = false;
    try {
      const out = await client.send(new GetParameterCommand({ Name: name }));
      on = out.Parameter?.Value === 'true';
    } catch {
      on = false;
    }
    last = { at: nowMs(), on };
    return on;
  };
}
