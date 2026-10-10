import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { DefinitionBody, StateMachine, StateMachineType } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import { alertLoopDefinition } from './alertLoopDefinition';

const sendEntry = fileURLToPath(new URL('../../apps/api/src/sendHandler.ts', import.meta.url));

export const SENDS_ENABLED_PARAMETER = '/vayu/watch/sends-enabled';

/** Nova Micro through the APAC cross-region profile (the bare model id is refused in ap-south-1). */
export const PHRASING_PROFILE_ID = 'apac.amazon.nova-micro-v1:0';
const PHRASING_MODEL_ID = 'amazon.nova-micro-v1:0';

export interface AlertLoopProps {
  readonly watch: Table;
  readonly telegramBotToken: ISecret;
  /** Groups flagged `demo: true`; replay alerts may go only to these (rule I17). */
  readonly demoGroupIds: readonly string[];
  /**
   * A Hindi voice note (Polly, Kajal) after each alert that has Hindi wording. Off by default: the
   * alerts stay text only until someone turns this on and reads the diff.
   */
  readonly voiceEnabled?: boolean;
}

/**
 * The AlertLoop on AWS: a Send Lambda, a Standard state machine that waits for a person, and a
 * kill switch. Sends are OFF until someone sets the parameter to "true", so deploying this cannot
 * message anybody by itself.
 */
export class AlertLoop extends Construct {
  readonly sendFunction: NodejsFunction;
  readonly stateMachine: StateMachine;
  readonly sendsEnabled: StringParameter;

  constructor(scope: Construct, id: string, props: AlertLoopProps) {
    super(scope, id);

    this.sendsEnabled = new StringParameter(this, 'SendsEnabled', {
      parameterName: SENDS_ENABLED_PARAMETER,
      stringValue: 'false',
      description: 'Kill switch for alert sends. Only the exact value "true" lets a send through.',
    });

    this.sendFunction = new NodejsFunction(this, 'SendFunction', {
      entry: sendEntry,
      runtime: Runtime.NODEJS_22_X,
      // X-Ray: every call to AWS from this function shows up in the service map.
      tracing: Tracing.ACTIVE,
      memorySize: 256,
      timeout: Duration.seconds(15),
      bundling: { externalModules: ['@aws-sdk/*'], minify: true },
      logGroup: new LogGroup(this, 'SendLogs', {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        WATCH_TABLE: props.watch.tableName,
        TELEGRAM_BOT_TOKEN_ARN: props.telegramBotToken.secretArn,
        SENDS_ENABLED_PARAM: this.sendsEnabled.parameterName,
        DEMO_GROUP_IDS: props.demoGroupIds.join(','),
        PHRASING: 'on',
        PHRASING_MODEL_ID: PHRASING_PROFILE_ID,
        VOICE: props.voiceEnabled === true ? 'on' : 'off',
      },
    });
    props.watch.grantReadWriteData(this.sendFunction);
    if (props.voiceEnabled === true) {
      // Polly's SynthesizeSpeech takes no resource, so "*" is the only possible scope: it can turn
      // text into speech and do nothing else. The grant exists only when voice is switched on.
      this.sendFunction.addToRolePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['polly:SynthesizeSpeech'],
          resources: ['*'],
        }),
      );
    }
    props.telegramBotToken.grantRead(this.sendFunction);
    this.sendsEnabled.grantRead(this.sendFunction);
    // Wording only: one model, through its inference profile. The profile routes across APAC
    // regions, so the foundation-model ARN has a wildcard region. If this call is ever refused,
    // the message simply goes out as the plain template and says so.
    const stack = Stack.of(this);
    this.sendFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:${stack.partition}:bedrock:${stack.region}:${stack.account}:inference-profile/${PHRASING_PROFILE_ID}`,
          `arn:${stack.partition}:bedrock:*::foundation-model/${PHRASING_MODEL_ID}`,
        ],
      }),
    );

    this.stateMachine = new StateMachine(this, 'AlertLoop', {
      stateMachineType: StateMachineType.STANDARD,
      definitionBody: DefinitionBody.fromString(
        Stack.of(this).toJsonString(alertLoopDefinition(this.sendFunction.functionArn)),
      ),
      timeout: Duration.hours(24),
      tracingEnabled: true,
    });
    this.sendFunction.grantInvoke(this.stateMachine);

    new CfnOutput(this, 'AlertLoopArn', { value: this.stateMachine.stateMachineArn });
    new CfnOutput(this, 'SendsEnabledParameter', { value: this.sendsEnabled.parameterName });
  }
}
