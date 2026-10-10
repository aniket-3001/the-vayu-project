import { fileURLToPath } from 'node:url';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { CfnSchedule } from 'aws-cdk-lib/aws-scheduler';
import type { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

const stationsEntry = fileURLToPath(
  new URL('../../apps/api/src/stationsHandler.ts', import.meta.url),
);

export interface StationsProps {
  readonly cache: Table;
  readonly openAqKey: ISecret;
  /** Minutes between runs. */
  readonly everyMinutes?: number;
  /** A disabled schedule stays in the stack but never fires. */
  readonly enabled?: boolean;
}

/**
 * The monitors on the map. EventBridge Scheduler starts one Lambda every 30 minutes; it lists the monitors
 * that reported lately, asks each for its latest value (a request a second, to stay under OpenAQ's limit) and
 * keeps the result in the Cache table. A visitor opening the map reads that, never OpenAQ.
 */
export class Stations extends Construct {
  readonly stationsFunction: NodejsFunction;
  readonly schedule: CfnSchedule;

  constructor(scope: Construct, id: string, props: StationsProps) {
    super(scope, id);

    this.stationsFunction = new NodejsFunction(this, 'StationsFunction', {
      entry: stationsEntry,
      runtime: Runtime.NODEJS_22_X,
      tracing: Tracing.ACTIVE,
      memorySize: 256,
      // Every wait has a limit (rule I9). Up to 75 monitors a second apiece is about 85 seconds.
      timeout: Duration.seconds(110),
      bundling: { externalModules: ['@aws-sdk/*'], minify: true },
      logGroup: new LogGroup(this, 'StationsLogs', {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        CACHE_TABLE: props.cache.tableName,
        OPENAQ_API_KEY_ARN: props.openAqKey.secretArn,
      },
    });
    props.cache.grant(this.stationsFunction, 'dynamodb:PutItem');
    props.openAqKey.grantRead(this.stationsFunction);

    const schedulerRole = new Role(this, 'SchedulerRole', {
      assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
    });
    this.stationsFunction.grantInvoke(schedulerRole);

    this.schedule = new CfnSchedule(this, 'Schedule', {
      description: 'Snapshot the monitors with a recent reading, for the map',
      scheduleExpression: `rate(${String(props.everyMinutes ?? 30)} minutes)`,
      state: props.enabled === false ? 'DISABLED' : 'ENABLED',
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        arn: this.stationsFunction.functionArn,
        roleArn: schedulerRole.roleArn,
        retryPolicy: { maximumRetryAttempts: 0 },
      },
    });
  }
}
