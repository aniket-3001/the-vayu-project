import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import type { CfnStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpApi, HttpMethod, HttpStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { AlertLoop } from './AlertLoop';
import { Accounts } from './Accounts';
import { Assistant } from './Assistant';
import { Analytics } from './Analytics';
import { FixCheck } from './FixCheck';
import { Harvest } from './Harvest';
import { Ingest } from './Ingest';
import { Operations } from './Operations';
import { Site } from './Site';
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

    // Mixed into the hash of a caller's address before the daily request limit is counted, so the hash cannot
    // be looked up anywhere else. CDK makes it; nobody reads it.
    const requestSalt = new Secret(this, 'RequestSalt', {
      generateSecretString: { excludePunctuation: true, passwordLength: 32 },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const apiFunction = new NodejsFunction(this, 'ApiFunction', {
      entry: apiEntry,
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
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
        REQUEST_SALT_ARN: requestSalt.secretArn,
      },
    });
    requestSalt.grantRead(apiFunction);
    cache.grantReadData(apiFunction);
    rooms.grantReadData(apiFunction);
    watch.grantReadWriteData(apiFunction);
    // Replay weeks are prepared by hand and uploaded under replay/; the API may read only that prefix.
    dataBucket.grantRead(apiFunction, 'replay/*');
    telegramBotToken.grantRead(apiFunction);
    telegramWebhookSecret.grantRead(apiFunction);
    firmsMapKey.grantRead(apiFunction);
    openAqKey.grantRead(apiFunction);

    // The assistant: a switch, a guardrail, and the one model it may call.
    new Assistant(this, 'Assistant').grant(apiFunction);

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
      // No CORS: the app is served from the same address as the API (CloudFront), so no other site needs to read it
      // from a browser. A page on another origin is refused by the browser, not by us.
    });
    // The routes that cost something or take a person's words get their own, tighter, throttle below.
    const limitedRoutes = [];
    for (const path of ['/v1/assistant', '/v1/speech', '/v1/requests', '/v1/fire-reports']) {
      limitedRoutes.push(
        ...api.addRoutes({
          path,
          methods: [HttpMethod.POST],
          integration: new HttpLambdaIntegration(
            `Integration${path.replace(/\W/gu, '')}`,
            apiFunction,
          ),
        }),
      );
    }
    // Accounts: sign-in through Cognito; API Gateway checks the token on /v1/me.
    const accounts = new Accounts(this, 'Accounts', { api, apiFunction });
    limitedRoutes.push(...accounts.routes);
    api.addRoutes({
      path: '/v1/{proxy+}',
      methods: [HttpMethod.GET, HttpMethod.POST],
      integration: new HttpLambdaIntegration('ApiIntegration', apiFunction),
    });
    // A public demo must not be able to run up a bill: cap the request rate (rule I15).
    const apiStage = new HttpStage(this, 'ApiStage', {
      httpApi: api,
      autoDeploy: true,
      throttle: { rateLimit: 25, burstLimit: 50 },
    });
    // Per route (rule I15): the assistant calls a model and the request form takes personal details, so they
    // are held far below the rest. The daily limits in the code count on top of this.
    // The stage's settings name those routes, so they must exist before the stage is updated.
    for (const route of limitedRoutes) apiStage.node.addDependency(route);
    (apiStage.node.defaultChild as CfnStage).routeSettings = {
      // Written as CloudFormation spells them: this property is an untyped map, so nothing converts the case.
      'POST /v1/assistant': { ThrottlingRateLimit: 3, ThrottlingBurstLimit: 6 },
      'POST /v1/speech': { ThrottlingRateLimit: 3, ThrottlingBurstLimit: 6 },
      'POST /v1/requests': { ThrottlingRateLimit: 1, ThrottlingBurstLimit: 3 },
      'POST /v1/fire-reports': { ThrottlingRateLimit: 1, ThrottlingBurstLimit: 3 },
      'GET /v1/me': { ThrottlingRateLimit: 3, ThrottlingBurstLimit: 6 },
      'PUT /v1/me': { ThrottlingRateLimit: 2, ThrottlingBurstLimit: 4 },
      'DELETE /v1/me': { ThrottlingRateLimit: 1, ThrottlingBurstLimit: 2 },
    };

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
      const site = new Site(this, 'Site', { api });
      new CfnOutput(this, 'SiteUrl', {
        value: `https://${site.distribution.distributionDomainName}`,
      });
      new CfnOutput(this, 'SiteBucketName', { value: site.bucket.bucketName });
      new CfnOutput(this, 'DistributionId', { value: site.distribution.distributionId });
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
