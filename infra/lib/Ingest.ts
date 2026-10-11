import { fileURLToPath } from 'node:url';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import { CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose';
import { CfnPolicy, CfnTopicRule } from 'aws-cdk-lib/aws-iot';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

const ingestEntry = fileURLToPath(new URL('../../apps/api/src/ingestHandler.ts', import.meta.url));

/** The one topic pattern units publish readings to. The unit name is the third segment. */
export const READINGS_TOPIC_FILTER = 'vayu/v1/+/readings';

export interface IngestProps {
  readonly rooms: Table;
  /** Where every reading is kept for history, under `device/`. */
  readonly dataBucket: IBucket;
  /** A disabled rule stays in the stack but forwards nothing. This is the ingest's off switch. */
  readonly enabled?: boolean;
}

/**
 * Device messaging: a unit publishes to `vayu/v1/{thingId}/readings`, an IoT rule hands each
 * message to the ingest Lambda (with the unit name taken from the topic), and the Lambda validates,
 * flags and stores it in the Rooms table. The device policy lets a unit connect as itself and
 * publish only under its own name; certificates are attached to it when a real unit is made.
 */
export class Ingest extends Construct {
  readonly ingestFunction: NodejsFunction;
  readonly rule: CfnTopicRule;
  readonly devicePolicy: CfnPolicy;
  readonly historyStream: CfnDeliveryStream;

  constructor(scope: Construct, id: string, props: IngestProps) {
    super(scope, id);

    this.ingestFunction = new NodejsFunction(this, 'IngestFunction', {
      entry: ingestEntry,
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      // X-Ray: every call to AWS from this function shows up in the service map.
      tracing: Tracing.ACTIVE,
      memorySize: 256,
      // Every wait has a limit (rule I9).
      timeout: Duration.seconds(10),
      bundling: { externalModules: ['@aws-sdk/*'], minify: true },
      logGroup: new LogGroup(this, 'IngestLogs', {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: { ROOMS_TABLE: props.rooms.tableName },
    });
    // Put only: the ingest cannot read, change or delete anyone's readings.
    props.rooms.grant(this.ingestFunction, 'dynamodb:PutItem');

    // History: the same message goes to Firehose, which batches it into S3 without any code of
    // ours. The Rooms table keeps a day for the app; this keeps everything for later analysis.
    const firehoseRole = new Role(this, 'HistoryRole', {
      assumedBy: new ServicePrincipal('firehose.amazonaws.com'),
    });
    // It may write under device/ and nowhere else in the bucket.
    firehoseRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          's3:PutObject',
          's3:AbortMultipartUpload',
          's3:GetBucketLocation',
          's3:ListBucketMultipartUploads',
        ],
        resources: [props.dataBucket.bucketArn, props.dataBucket.arnForObjects('device/*')],
      }),
    );
    this.historyStream = new CfnDeliveryStream(this, 'HistoryStream', {
      deliveryStreamType: 'DirectPut',
      extendedS3DestinationConfiguration: {
        bucketArn: props.dataBucket.bucketArn,
        roleArn: firehoseRole.roleArn,
        prefix: 'device/readings/dt=!{timestamp:yyyy-MM-dd}/',
        errorOutputPrefix:
          'device/errors/!{firehose:error-output-type}/dt=!{timestamp:yyyy-MM-dd}/',
        bufferingHints: { intervalInSeconds: 300, sizeInMBs: 5 },
        compressionFormat: 'GZIP',
      },
    });
    const iotToFirehose = new Role(this, 'IotToHistoryRole', {
      assumedBy: new ServicePrincipal('iot.amazonaws.com'),
    });
    iotToFirehose.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['firehose:PutRecord'],
        resources: [this.historyStream.attrArn],
      }),
    );

    this.rule = new CfnTopicRule(this, 'ReadingsRule', {
      ruleName: 'vayu_readings',
      topicRulePayload: {
        sql: `SELECT *, topic(3) AS thingId FROM '${READINGS_TOPIC_FILTER}'`,
        awsIotSqlVersion: '2016-03-23',
        ruleDisabled: props.enabled === false,
        actions: [
          { lambda: { functionArn: this.ingestFunction.functionArn } },
          {
            firehose: {
              deliveryStreamName: this.historyStream.ref,
              roleArn: iotToFirehose.roleArn,
              separator: '\n',
            },
          },
        ],
      },
    });
    this.ingestFunction.addPermission('FromIotRule', {
      principal: new ServicePrincipal('iot.amazonaws.com'),
      sourceArn: this.rule.attrArn,
      sourceAccount: Stack.of(this).account,
    });

    this.devicePolicy = new CfnPolicy(this, 'DevicePolicy', {
      policyName: 'vayu-device',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: 'iot:Connect',
            Resource: `arn:aws:iot:${Stack.of(this).region}:${Stack.of(this).account}:client/\${iot:Connection.Thing.ThingName}`,
          },
          {
            Effect: 'Allow',
            Action: 'iot:Publish',
            Resource: `arn:aws:iot:${Stack.of(this).region}:${Stack.of(this).account}:topic/vayu/v1/\${iot:Connection.Thing.ThingName}/*`,
          },
        ],
      },
    });
  }
}
