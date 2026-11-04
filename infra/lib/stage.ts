import type { Construct } from 'constructs';

/**
 * A second copy of the whole stack ("staging") can live in the same AWS account beside the real one. Almost every
 * resource gets its name from CloudFormation and so cannot clash; the few that carry a fixed name (the kill-switch
 * parameters, the IoT rule and policy, the dashboard, the cost monitors) are given the stage in it. With no stage
 * (the real stack) every name is exactly what it always was.
 */
export const STAGE_CONTEXT = 'vayu:stage';

/** Lower-case letters and digits only, so the stage fits every kind of name AWS has (IoT rules allow no hyphen). */
export const STAGE_PATTERN = /^[a-z][a-z0-9]{0,11}$/u;

export function stageOf(scope: Construct): string | undefined {
  const value: unknown = scope.node.tryGetContext(STAGE_CONTEXT);
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !STAGE_PATTERN.test(value)) {
    throw new Error(
      `Stage must be lower-case letters and digits, starting with a letter: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/** `/vayu/assistant/enabled` becomes `/vayu-staging/assistant/enabled` in staging; unchanged without a stage. */
export function stageName(scope: Construct, base: string): string {
  const stage = stageOf(scope);
  return stage === undefined ? base : base.replace('vayu', `vayu-${stage}`);
}

/** A display name: `Vayu` for the real stack, `Vayu-staging` for a stage. */
export function stageTitle(scope: Construct): string {
  const stage = stageOf(scope);
  return stage === undefined ? 'Vayu' : `Vayu-${stage}`;
}

/** The same for names that may hold only letters, digits and underscores: `vayu_readings` becomes `vayu_staging_readings`. */
export function stageIdent(scope: Construct, base: string): string {
  const stage = stageOf(scope);
  return stage === undefined ? base : base.replace('vayu', `vayu_${stage}`);
}
