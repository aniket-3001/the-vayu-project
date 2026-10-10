import { SendTaskSuccessCommand, type SFNClient } from '@aws-sdk/client-sfn';
import { GetParameterCommand, type SSMClient } from '@aws-sdk/client-ssm';
import { StaleTaskTokenError, type SendTaskSuccess } from '@vayu/watch';

const STALE_TOKEN_ERRORS = new Set(['TaskTimedOut', 'TaskDoesNotExist', 'InvalidToken']);

/** `SendTaskSuccess` against Step Functions. A finished or timed-out task is a stale token, not a failure. */
export function sfnSendTaskSuccess(client: Pick<SFNClient, 'send'>): SendTaskSuccess {
  return async (taskToken, output) => {
    try {
      await client.send(new SendTaskSuccessCommand({ taskToken, output }));
    } catch (error) {
      if (error instanceof Error && STALE_TOKEN_ERRORS.has(error.name)) {
        throw new StaleTaskTokenError();
      }
      throw error;
    }
  };
}

/**
 * The kill switch: an SSM parameter holding "true" or "false". Anything else, a missing
 * parameter, or an error reading it counts as off, so a fault can never switch sends on.
 */
export function ssmSendsEnabled(
  client: Pick<SSMClient, 'send'>,
  parameterName: string,
): () => Promise<boolean> {
  return async () => {
    try {
      const result = await client.send(new GetParameterCommand({ Name: parameterName }));
      return result.Parameter?.Value === 'true';
    } catch {
      return false;
    }
  };
}
