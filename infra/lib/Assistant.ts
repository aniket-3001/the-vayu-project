import { Stack } from 'aws-cdk-lib';
import { CfnGuardrail, CfnGuardrailVersion } from 'aws-cdk-lib/aws-bedrock';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/**
 * The model the assistant may call, through its Asia-Pacific inference profile. Nova Micro cannot be called by its
 * bare id in ap-south-1; the profile can. One model only: nothing else is granted.
 */
export const ASSISTANT_PROFILE_ID = 'apac.amazon.nova-micro-v1:0';
export const ASSISTANT_MODEL_ID = 'amazon.nova-micro-v1:0';
export const ASSISTANT_SWITCH_PARAMETER = '/vayu/assistant/enabled';

/**
 * The assistant's guardrails in AWS: a switch anyone can flip, a Bedrock Guardrail on every prompt and answer, and
 * the one model it may call. The code's own limits (the rules decide, numbers are checked, names stay home, a
 * daily cap) are in `apps/api/src/assistantAgent.ts`; these are the ones AWS enforces from outside it.
 */
export class Assistant extends Construct {
  readonly enabled: StringParameter;
  readonly guardrail: CfnGuardrail;
  readonly guardrailVersion: CfnGuardrailVersion;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // On for the exact value "true"; anything else, or an error reading it, is off. Flip it to stop all spend.
    this.enabled = new StringParameter(this, 'Enabled', {
      parameterName: ASSISTANT_SWITCH_PARAMETER,
      stringValue: 'true',
      description:
        'The assistant calls the model only while this is exactly "true". Anything else turns it off.',
    });

    this.guardrail = new CfnGuardrail(this, 'Guardrail', {
      name: 'vayu-assistant',
      description:
        'Keeps the assistant to air, health-neutral guidance, and out of medicine and attacks.',
      blockedInputMessaging:
        'I can only help with the air, walks, school, masks, windows, alerts and stubble burning.',
      blockedOutputsMessaging:
        'I cannot say that. I can help with the air, walks, school, masks, windows, alerts and stubble burning.',
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
        ],
      },
      topicPolicyConfig: {
        topicsConfig: [
          {
            name: 'medical-advice',
            type: 'DENY',
            definition:
              'Diagnosing or treating a health condition, or advice on medicines, doses or treatment.',
            examples: [
              'What medicine should my child take for a cough from the smoke?',
              'How many puffs of my inhaler should I take today?',
              'Do I have asthma from this air?',
            ],
          },
        ],
      },
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          { type: 'EMAIL', action: 'BLOCK' },
          { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
          { type: 'PASSWORD', action: 'BLOCK' },
        ],
      },
    });
    this.guardrailVersion = new CfnGuardrailVersion(this, 'GuardrailVersion1', {
      guardrailIdentifier: this.guardrail.attrGuardrailId,
      description: 'First version',
    });
  }

  /** Lets a function read the switch and call the one model, behind the guardrail, and nothing more. */
  grant(
    fn: IFunction & {
      addEnvironment(key: string, value: string): unknown;
      addToRolePolicy(s: PolicyStatement): void;
    },
  ): void {
    const stack = Stack.of(this);
    fn.addEnvironment('ASSISTANT_SWITCH_PARAM', this.enabled.parameterName);
    fn.addEnvironment('ASSISTANT_MODEL_ID', ASSISTANT_PROFILE_ID);
    fn.addEnvironment('GUARDRAIL_ID', this.guardrail.attrGuardrailId);
    fn.addEnvironment('GUARDRAIL_VERSION', this.guardrailVersion.attrVersion);
    this.enabled.grantRead(fn);
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:${stack.partition}:bedrock:${stack.region}:${stack.account}:inference-profile/${ASSISTANT_PROFILE_ID}`,
          `arn:${stack.partition}:bedrock:*::foundation-model/${ASSISTANT_MODEL_ID}`,
        ],
      }),
    );
    // The voice that reads answers aloud. Polly's SynthesizeSpeech takes no resource, so "*" is the only possible
    // scope: it can turn text into speech and do nothing else.
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['polly:SynthesizeSpeech'],
        resources: ['*'],
      }),
    );
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:ApplyGuardrail'],
        resources: [this.guardrail.attrGuardrailArn],
      }),
    );
  }
}
