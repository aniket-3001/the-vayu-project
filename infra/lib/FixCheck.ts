import { fileURLToPath } from 'node:url';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { DefinitionBody, StateMachine, StateMachineType } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import { fixCheckDefinition } from './fixCheckDefinition';

const fixCheckEntry = fileURLToPath(
  new URL('../../apps/api/src/fixCheckHandler.ts', import.meta.url),
);

export interface FixCheckProps {
  readonly watch: Table;
  readonly rooms: Table;
  readonly cache: Table;
}

/**
 * "Did it work?": a Standard state machine that looks at a room, waits, looks again, and writes the
 * answer. The Lambda it calls may read the room and the harvest cache and write only its own
 * answer records; the machine may call that one function and nothing else.
 */
export class FixCheck extends Construct {
  readonly stepFunction: NodejsFunction;
  readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: FixCheckProps) {
    super(scope, id);

    this.stepFunction = new NodejsFunction(this, 'StepFunction', {
      entry: fixCheckEntry,
      runtime: Runtime.NODEJS_22_X,
      // X-Ray: every call to AWS from this function shows up in the service map.
      tracing: Tracing.ACTIVE,
      memorySize: 256,
      // Under the 30 seconds each task is given, so the machine's limit is what ends a slow step.
      timeout: Duration.seconds(25),
      bundling: { externalModules: ['@aws-sdk/*'], minify: true },
      logGroup: new LogGroup(this, 'StepLogs', {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        WATCH_TABLE: props.watch.tableName,
        ROOMS_TABLE: props.rooms.tableName,
        CACHE_TABLE: props.cache.tableName,
      },
    });
    // Its own answer records: read one, write one. Not the links, taps or tokens beside them.
    props.watch.grant(this.stepFunction, 'dynamodb:GetItem', 'dynamodb:PutItem');
    props.rooms.grantReadData(this.stepFunction);
    props.cache.grantReadData(this.stepFunction);

    this.stateMachine = new StateMachine(this, 'FixCheck', {
      stateMachineType: StateMachineType.STANDARD,
      definitionBody: DefinitionBody.fromString(
        Stack.of(this).toJsonString(fixCheckDefinition(this.stepFunction.functionArn)),
      ),
      timeout: Duration.hours(1),
      tracingEnabled: true,
    });
    this.stepFunction.grantInvoke(this.stateMachine);
  }
}
