import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod, HttpStage, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import {
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { AlertLoop } from './AlertLoop';
import { Analytics } from './Analytics';
import { FixCheck } from './FixCheck';
import { Harvest } from './Harvest';
import { Ingest } from './Ingest';
import { Operations } from './Operations';
import { Stations } from './Stations';

export interface VayuStackProps extends StackProps {
  /** Where budget alerts go. Without it, no budget is created. */
  readonly alertEmail?: string;
  /** Monthly spend limit in US dollars. */
  readonly monthlyBudgetUsd?: number;
  /**
   * Set to false to skip the CloudFront-fronted site, e.g. while an AWS
   * account is still awaiting CloudFront verification. Defaults to true.
   */
  readonly includeSite?: boolean;
  /** Set to false to keep the harvest schedule in the stack but switched off. Defaults to true. */
  readonly harvestEnabled?: boolean;
  /** Set to false to keep the device rule in the stack but forwarding nothing. Defaults to true. */
  readonly ingestEnabled?: boolean;
  /** Set to true to give alerts a Hindi voice note too (Polly). Defaults to false. */
  readonly voiceEnabled?: boolean;
}

export const DIRECTORY_INDEX_FUNCTION = `
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
    return request;
  }
  var last = uri.split('/').pop();
  if (last.indexOf('.') === -1) {
    return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: uri + '/' } } };
  }
  return request;
}
`;

const apiEntry = fileURLToPath(new URL('../../apps/api/src/handler.ts', import.meta.url));

/**
 * The thin slice: three small tables, a private data bucket, one API Lambda behind an HTTP API
 * with throttling, and a CloudFront site. Small on purpose; it grows by adding to this, not
 * by rewriting it.
 */
export class VayuStack extends Stack {
  constructor(scope: Construct, id: string, props: VayuStackProps = {}) {
    super(scope, id, props);

    const table = (name: string, sortKey?: string): Table =>
      new Table(this, name, {
        partitionKey: { name: 'pk', type: AttributeType.STRING },
        ...(sortKey === undefined
          ? {}
          : { sortKey: { name: sortKey, type: AttributeType.STRING } }),
        billingMode: BillingMode.PAY_PER_REQUEST,
        timeToLiveAttribute: 'expiresAt',
        removalPolicy: RemovalPolicy.DESTROY,
      });
    // Cache: stations, latest readings, forecasts. Rooms: the module's latest and recent readings.
    // Watch: links, groups, alerts, tokens and sent-markers, told apart by key prefix.
    const cache = table('Cache');
    const rooms = table('Rooms', 'sk');
    const watch = table('Watch', 'sk');

    const dataBucket = new Bucket(this, 'DataBucket', {
      // Athena writes query results here; they are scratch, so they expire.
      lifecycleRules: [
        { id: 'expire-athena-results', prefix: 'athena-results/', expiration: Duration.days(7) },
      ],
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // The bot token was created once, by hand, via BotFather, and stored out of band (tracker/TODO.md).
    const telegramBotToken = Secret.fromSecretNameV2(
      this,
      'TelegramBotToken',
      'vayu/telegram-bot-token',
    );
    // The FIRMS key (free, NASA) was also stored by hand; same lookup-not-create pattern.
    const firmsMapKey = Secret.fromSecretNameV2(this, 'FirmsMapKey', 'vayu/firms-map-key');
    // The OpenAQ key, stored the same way.
    const openAqKey = Secret.fromSecretNameV2(this, 'OpenAqKey', 'vayu/openaq-api-key');
    // This one CDK manages itself: a random value only we and Telegram ever see, checked on
    // every webhook call against the `X-Telegram-Bot-Api-Secret-Token` header (rule-of-thumb:
    // never trust a public URL without a shared secret).
    const telegramWebhookSecret = new Secret(this, 'TelegramWebhookSecret', {
      generateSecretString: { excludePunctuation: true, passwordLength: 32 },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const apiFunction = new NodejsFunction(this, 'ApiFunction', {
      entry: apiEntry,
      runtime: Runtime.NODEJS_22_X,
      // X-Ray: every call to AWS from this function shows up in the service map.
      tracing: Tracing.ACTIVE,
      memorySize: 256,
      timeout: Duration.seconds(10),
      bundling: { externalModules: ['@aws-sdk/*'], minify: true },
      logGroup: new LogGroup(this, 'ApiLogs', {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        CACHE_TABLE: cache.tableName,
        ROOMS_TABLE: rooms.tableName,
        WATCH_TABLE: watch.tableName,
        DATA_BUCKET: dataBucket.bucketName,
        TELEGRAM_BOT_TOKEN_ARN: telegramBotToken.secretArn,
        TELEGRAM_WEBHOOK_SECRET_ARN: telegramWebhookSecret.secretArn,
        FIRMS_MAP_KEY_ARN: firmsMapKey.secretArn,
        OPENAQ_API_KEY_ARN: openAqKey.secretArn,
      },
    });
    cache.grantReadData(apiFunction);
    rooms.grantReadData(apiFunction);
    watch.grantReadWriteData(apiFunction);
    // Replay weeks are prepared by hand and uploaded under replay/; the API may read only that prefix.
    dataBucket.grantRead(apiFunction, 'replay/*');
    telegramBotToken.grantRead(apiFunction);
    telegramWebhookSecret.grantRead(apiFunction);
    firmsMapKey.grantRead(apiFunction);
    openAqKey.grantRead(apiFunction);

    // Athena over the harvest and the public OpenAQ archive.
    new Analytics(this, 'Analytics', { dataBucket });

    // The harvest: public data on a clock, into the cache and raw snapshots in S3.
    const harvest = new Harvest(this, 'Harvest', {
      cache,
      dataBucket,
      openAqKey,
      ...(props.harvestEnabled === undefined ? {} : { enabled: props.harvestEnabled }),
    });

    // The monitors on the map, snapshotted on a clock so visitors never reach OpenAQ.
    const stations = new Stations(this, 'Stations', {
      cache,
      openAqKey,
      ...(props.harvestEnabled === undefined ? {} : { enabled: props.harvestEnabled }),
    });

    // "Did it work?": look at a room, wait, look again, write the answer.
    const fixCheck = new FixCheck(this, 'FixCheck', { watch, rooms, cache });
    apiFunction.addEnvironment('FIXCHECK_STATE_MACHINE_ARN', fixCheck.stateMachine.stateMachineArn);
    // The API may start this one machine, so a run can be asked for over HTTP.
    fixCheck.stateMachine.grantStartExecution(apiFunction);

    // Device messaging: units publish to IoT Core, a rule hands readings to the ingest Lambda.
    const ingest = new Ingest(this, 'Ingest', {
      rooms,
      dataBucket,
      ...(props.ingestEnabled === undefined ? {} : { enabled: props.ingestEnabled }),
    });

    // The alert loop: a Send Lambda plus a state machine that waits for a person. Sends stay off
    // until the kill-switch parameter is set to "true".
    const alertLoop = new AlertLoop(this, 'AlertLoop', {
      watch,
      telegramBotToken,
      demoGroupIds: ['school-demo', 'parents-demo', 'walkers-demo'],
      ...(props.voiceEnabled === undefined ? {} : { voiceEnabled: props.voiceEnabled }),
    });
    // A first-time button tap resumes the step that is waiting for it. AWS offers no
    // resource-level control on task-token actions, so this one statement is on "*"; the only
    // thing it can do is mark a waiting step as answered, and it needs the token to do it.
    apiFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['states:SendTaskSuccess'],
        resources: ['*'],
      }),
    );

    const api = new HttpApi(this, 'Api', {
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: ['*'],
        // POST so the app can start a "did it work?" run; its body is JSON.
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST],
        allowHeaders: ['content-type'],
        maxAge: Duration.days(1),
      },
    });
    api.addRoutes({
      path: '/v1/{proxy+}',
      methods: [HttpMethod.GET, HttpMethod.POST],
      integration: new HttpLambdaIntegration('ApiIntegration', apiFunction),
    });
    // A public demo must not be able to run up a bill: cap the request rate (rule I15).
    const apiStage = new HttpStage(this, 'ApiStage', {
      httpApi: api,
      autoDeploy: true,
      throttle: { rateLimit: 50, burstLimit: 100 },
    });

    // Seeing that it works, and hearing when it does not.
    new Operations(this, 'Operations', {
      apiFunction,
      harvestFunction: harvest.harvestFunction,
      stationsFunction: stations.stationsFunction,
      ingestFunction: ingest.ingestFunction,
      sendFunction: alertLoop.sendFunction,
      alertLoop: alertLoop.stateMachine,
      httpApi: api,
      httpStage: apiStage,
      alertEmail: props.alertEmail,
    });

    if (props.includeSite !== false) {
      const siteBucket = new Bucket(this, 'SiteBucket', {
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        encryption: BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      });
      // CloudFront only serves a default page at the root, so /app/ needs help: a trailing-slash
      // request gets index.html, and /app (no slash, no file extension) redirects to /app/ so the
      // app's relative asset paths resolve.
      const directoryIndex = new CloudFrontFunction(this, 'DirectoryIndex', {
        runtime: FunctionRuntime.JS_2_0,
        code: FunctionCode.fromInline(DIRECTORY_INDEX_FUNCTION),
      });
      const site = new Distribution(this, 'Site', {
        defaultRootObject: 'index.html',
        defaultBehavior: {
          origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          functionAssociations: [
            { function: directoryIndex, eventType: FunctionEventType.VIEWER_REQUEST },
          ],
        },
      });
      new CfnOutput(this, 'SiteUrl', { value: `https://${site.distributionDomainName}` });
      new CfnOutput(this, 'SiteBucketName', { value: siteBucket.bucketName });
    }

    if (props.alertEmail !== undefined) {
      new CfnBudget(this, 'MonthlyBudget', {
        budget: {
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: props.monthlyBudgetUsd ?? 20, unit: 'USD' },
        },
        notificationsWithSubscribers: [
          {
            notification: {
              notificationType: 'ACTUAL',
              comparisonOperator: 'GREATER_THAN',
              threshold: 80,
            },
            subscribers: [{ subscriptionType: 'EMAIL', address: props.alertEmail }],
          },
        ],
      });
    }

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
  }
}
