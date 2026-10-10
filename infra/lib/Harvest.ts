import { fileURLToPath } from 'node:url';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { CfnSchedule } from 'aws-cdk-lib/aws-scheduler';
import type { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

const harvestEntry = fileURLToPath(
  new URL('../../apps/api/src/harvestHandler.ts', import.meta.url),
);

export interface HarvestProps {
  readonly cache: Table;
  readonly dataBucket: IBucket;
  readonly openAqKey: ISecret;
  /** Minutes between runs. */
  readonly everyMinutes?: number;
  /** A disabled schedule stays in the stack but never fires. This is the harvest's off switch. */
  readonly enabled?: boolean;
}

/**
 * The scheduled harvest: EventBridge Scheduler starts one Lambda every 15 minutes. The Lambda
 * reads public data, writes the latest answer per place to the Cache table and appends raw lines
 * to `harvest/` in the data bucket. It may write to that prefix and nowhere else.
 */
export class Harvest extends Construct {
  readonly harvestFunction: NodejsFunction;
  readonly schedule: CfnSchedule;

  constructor(scope: Construct, id: string, props: HarvestProps) {
    super(scope, id);

    this.harvestFunction = new NodejsFunction(this, 'HarvestFunction', {
      entry: harvestEntry,
      runtime: Runtime.NODEJS_22_X,
      // X-Ray: every call to AWS from this function shows up in the service map.
      tracing: Tracing.ACTIVE,
      memorySize: 256,
      // Every wait has a limit (rule I9). A run that cannot finish in two minutes is a failed run.
      timeout: Duration.minutes(2),
      bundling: { externalModules: ['@aws-sdk/*'], minify: true },
      logGroup: new LogGroup(this, 'HarvestLogs', {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        CACHE_TABLE: props.cache.tableName,
        DATA_BUCKET: props.dataBucket.bucketName,
        OPENAQ_API_KEY_ARN: props.openAqKey.secretArn,
      },
    });
    props.cache.grant(this.harvestFunction, 'dynamodb:PutItem');
    props.openAqKey.grantRead(this.harvestFunction);
    // Put only, and only under harvest/: a bug here cannot overwrite replay weeks or anything else.
    this.harvestFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:PutObject'],
        resources: [props.dataBucket.arnForObjects('harvest/*')],
      }),
    );

    const schedulerRole = new Role(this, 'SchedulerRole', {
      assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
    });
    this.harvestFunction.grantInvoke(schedulerRole);

    this.schedule = new CfnSchedule(this, 'Schedule', {
      description: 'Harvest public air data into the cache and raw snapshots',
      scheduleExpression: `rate(${props.everyMinutes ?? 15} minutes)`,
      state: props.enabled === false ? 'DISABLED' : 'ENABLED',
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        arn: this.harvestFunction.functionArn,
        roleArn: schedulerRole.roleArn,
        retryPolicy: { maximumRetryAttempts: 0 },
      },
    });
  }
}
