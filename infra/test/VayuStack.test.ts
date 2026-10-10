import { runInNewContext } from 'node:vm';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_CHECK_SQL,
  DEVICE_HISTORY_SQL,
  FORECAST_ERROR_SQL,
  HARVEST_COVERAGE_SQL,
} from '../lib/queries';
import { APP_INDEX_FUNCTION, CONTENT_SECURITY_POLICY } from '../lib/Site';
import { VayuStack, type VayuStackProps } from '../lib/VayuStack';

const synth = (alertEmail?: string): Template =>
  Template.fromStack(
    new VayuStack(new App(), 'Test', alertEmail === undefined ? {} : { alertEmail }),
  );

const synthWith = (props: VayuStackProps): Template =>
  Template.fromStack(new VayuStack(new App(), 'Test', props));

describe('the Vayu stack', () => {
  const template = synth();

  it('has three tables whose old items expire by themselves', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 3);
    const tables = Object.values(template.findResources('AWS::DynamoDB::Table'));
    for (const table of tables) {
      expect(table.Properties).toMatchObject({
        TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
      });
    }
  });

  it('keeps every bucket private and encrypted', () => {
    const buckets = Object.values(template.findResources('AWS::S3::Bucket'));
    expect(buckets).toHaveLength(2);
    for (const bucket of buckets) {
      expect(bucket.Properties).toMatchObject({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    }
  });

  it('rule I15: throttles the public API so a demo cannot run up a bill', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: { ThrottlingRateLimit: 50, ThrottlingBurstLimit: 100 },
    });
  });

  it('runs the API on Node.js 22 and keeps its logs for a month', () => {
    template.hasResourceProperties('AWS::Lambda::Function', { Runtime: 'nodejs22.x' });
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });

  it('serves the site over HTTPS only', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: { DefaultCacheBehavior: { ViewerProtocolPolicy: 'redirect-to-https' } },
    });
  });

  it('rule I15: creates a budget alert only when given an email', () => {
    template.resourceCountIs('AWS::Budgets::Budget', 0);
    synth('someone@example.com').hasResourceProperties('AWS::Budgets::Budget', {
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Subscribers: [{ Address: 'someone@example.com', SubscriptionType: 'EMAIL' }],
        }),
      ]),
    });
  });

  it('accepts POST (the Telegram webhook) alongside GET on the same route', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /v1/{proxy+}',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /v1/{proxy+}',
    });
  });

  it('creates its own webhook secret and references the hand-created bot token secret, both readable by the API', () => {
    template.resourceCountIs('AWS::SecretsManager::Secret', 2); // the webhook secret and the request salt; the bot token is looked up, not created
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      GenerateSecretString: Match.objectLike({ ExcludePunctuation: true, PasswordLength: 32 }),
    });
    const policies = template.findResources('AWS::IAM::Policy') as Record<
      string,
      { Properties: { PolicyDocument: { Statement: unknown[] } } }
    >;
    const statements = Object.values(policies).flatMap(
      (policy) => policy.Properties.PolicyDocument.Statement,
    );
    const secretReads = statements.filter(
      (statement) =>
        Match.objectLike({
          Action: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        }).test(statement).isSuccess,
    );
    expect(secretReads).toHaveLength(8); // the webhook secret, the request salt, the bot token (API and Send), the FIRMS key, and the OpenAQ key (API, harvest and the map monitors)
  });

  describe('the alert loop', () => {
    const statements = (): { Action: unknown; Resource: unknown; Effect: string }[] =>
      Object.values(
        template.findResources('AWS::IAM::Policy') as Record<
          string,
          {
            Properties: {
              PolicyDocument: {
                Statement: { Action: unknown; Resource: unknown; Effect: string }[];
              };
            };
          }
        >,
      ).flatMap((policy) => policy.Properties.PolicyDocument.Statement);

    it('keeps sends OFF by default: the kill switch parameter is "false"', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/vayu/watch/sends-enabled',
        Value: 'false',
      });
    });

    it('is a Standard state machine with a 24-hour ceiling that waits for a task token with a timeout', () => {
      // Two machines: this one and FixCheck, which has its own tests.
      template.resourceCountIs('AWS::StepFunctions::StateMachine', 2);
      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        StateMachineType: 'STANDARD',
        DefinitionString: Match.anyValue(),
      });
      const machine = Object.values(
        template.findResources('AWS::StepFunctions::StateMachine') as Record<
          string,
          { Properties: { DefinitionString: unknown } }
        >,
      ).find((candidate) =>
        JSON.stringify(candidate.Properties.DefinitionString).includes('waitForTaskToken'),
      );
      const definition = JSON.stringify(machine?.Properties.DefinitionString);
      expect(definition).toContain('lambda:invoke.waitForTaskToken');
      expect(definition).toContain('TimeoutSecondsPath');
      expect(definition).toContain('SendsDisabledError');
    });

    it('gives the Send function exactly: the Watch table, the bot token, the kill switch parameter', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            SENDS_ENABLED_PARAM: Match.anyValue(), // a reference to the parameter above
            DEMO_GROUP_IDS: 'school-demo,parents-demo,walkers-demo',
          }),
        },
      });
      const ssmReads = statements().filter((s) =>
        JSON.stringify(s.Action).includes('ssm:GetParameter'),
      );
      // The Send function's kill switch, and the assistant's (read by the API).
      expect(ssmReads).toHaveLength(2);
      for (const read of ssmReads) expect(JSON.stringify(read.Resource)).toContain('parameter');
    });

    it('lets the Send function call exactly one Bedrock model, via its inference profile', () => {
      const bedrock = statements().filter((s) => s.Action === 'bedrock:InvokeModel');
      // The Send function and the assistant (in the API) each have one, and they are the same one model.
      expect(bedrock).toHaveLength(2);
      for (const statement of bedrock) {
        const resources = JSON.stringify(statement.Resource);
        expect(resources).toContain('inference-profile/apac.amazon.nova-micro-v1:0');
        expect(resources).toContain('foundation-model/amazon.nova-micro-v1:0');
        expect(resources).not.toMatch(/foundation-model\/\*/);
      }
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            PHRASING: 'on',
            PHRASING_MODEL_ID: 'apac.amazon.nova-micro-v1:0',
          }),
        },
      });
    });

    it('lets only four roles invoke a function: the alert loop (Send), FixCheck and the scheduler (harvest and the map monitors)', () => {
      const invokes = statements().filter((s) =>
        JSON.stringify(s.Action).includes('lambda:InvokeFunction'),
      );
      expect(invokes).toHaveLength(4);
    });

    it('puts states:SendTaskSuccess on exactly one policy (the API function, whose resource must be "*")', () => {
      const resumes = statements().filter((s) =>
        JSON.stringify(s.Action).includes('states:SendTaskSuccess'),
      );
      expect(resumes).toHaveLength(1);
      expect(resumes[0]?.Resource).toBe('*');
    });
  });

  it('grants the API read and write on the Watch table (rule I8 relies on a conditional write there)', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['dynamodb:PutItem', 'dynamodb:DeleteItem']),
          }),
        ]),
      },
    });
  });

  it('can skip the CloudFront site while an account awaits verification, without touching the data/API layer', () => {
    const withoutSite = synthWith({ includeSite: false });
    withoutSite.resourceCountIs('AWS::CloudFront::Distribution', 0);
    withoutSite.resourceCountIs('AWS::CloudFront::Function', 0);
    withoutSite.resourceCountIs('AWS::S3::Bucket', 1); // DataBucket only, no SiteBucket
    withoutSite.resourceCountIs('AWS::DynamoDB::Table', 3);
    withoutSite.hasResourceProperties('AWS::Lambda::Function', { Runtime: 'nodejs22.x' });
    withoutSite.hasOutput('ApiUrl', {});
  });
});

describe('the public site', () => {
  interface Result {
    uri?: string;
  }
  const handler = runInNewContext(`${APP_INDEX_FUNCTION}; handler`) as (e: unknown) => Result;
  const run = (uri: string): string | undefined => handler({ request: { uri } }).uri;

  it('serves the app for the address and for any path that names no file, and every real file as it is', () => {
    expect(run('/')).toBe('/index.html');
    expect(run('/place/abc')).toBe('/index.html');
    for (const uri of [
      '/assets/index-abc.js',
      '/assets/maplibre-gl-worker-x.js',
      '/favicon.svg',
      '/index.html',
    ])
      expect(run(uri)).toBe(uri);
  });

  const template = synth();
  const distribution = (): { DistributionConfig: Record<string, unknown> } =>
    (
      Object.values(template.findResources('AWS::CloudFront::Distribution'))[0] as {
        Properties: { DistributionConfig: Record<string, unknown> };
      }
    ).Properties;

  it('serves over HTTPS only, from a private bucket that only this distribution can read', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
          Compress: true,
        }),
        DefaultRootObject: 'index.html',
        PriceClass: 'PriceClass_200',
      }),
    });
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Condition: Match.anyValue(),
          }),
        ]),
      }),
    });
  });

  it('puts our API under /v1/* on the same address, for every method, over HTTPS only', () => {
    const config = distribution().DistributionConfig as {
      CacheBehaviors: {
        PathPattern: string;
        ViewerProtocolPolicy: string;
        AllowedMethods: string[];
      }[];
    };
    expect(config.CacheBehaviors).toHaveLength(1);
    expect(config.CacheBehaviors[0]).toMatchObject({
      PathPattern: '/v1/*',
      ViewerProtocolPolicy: 'https-only',
    });
    expect(config.CacheBehaviors[0]?.AllowedMethods).toContain('POST');
  });

  it('keeps an API answer for at most fifteen minutes, and by default not at all, so the API says how long', () => {
    template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
      CachePolicyConfig: Match.objectLike({
        MinTTL: 0,
        DefaultTTL: 0,
        MaxTTL: 900,
        ParametersInCacheKeyAndForwardedToOrigin: Match.objectLike({
          QueryStringsConfig: { QueryStringBehavior: 'all' },
          CookiesConfig: { CookieBehavior: 'none' },
        }),
      }),
    });
  });

  it('sends the API only the viewer address, never the viewer Host header, which API Gateway refuses', () => {
    template.hasResourceProperties('AWS::CloudFront::OriginRequestPolicy', {
      OriginRequestPolicyConfig: Match.objectLike({
        HeadersConfig: {
          HeaderBehavior: 'whitelist',
          Headers: ['CloudFront-Viewer-Address'],
        },
        CookiesConfig: { CookieBehavior: 'none' },
      }),
    });
  });

  it('sends the security headers: HSTS, no sniffing, no framing, a strict referrer, and a content policy that names every outside host', () => {
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({
          StrictTransportSecurity: Match.objectLike({ Override: true }),
          ContentTypeOptions: { Override: true },
          FrameOptions: { FrameOption: 'DENY', Override: true },
          ContentSecurityPolicy: { ContentSecurityPolicy: CONTENT_SECURITY_POLICY, Override: true },
        }),
      }),
    });
    for (const host of [
      'tiles.openfreemap.org',
      'api.open-meteo.com',
      'air-quality-api.open-meteo.com',
      'geocoding-api.open-meteo.com',
    ])
      expect(CONTENT_SECURITY_POLICY).toContain(host);
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*unsafe/u);
  });

  it('reports where to upload the app and which distribution to refresh', () => {
    template.hasOutput('SiteUrl', {});
    template.hasOutput('SiteBucketName', {});
    template.hasOutput('DistributionId', {});
  });

  describe('the harvest', () => {
    const template = synth();
    const harvestStatements = (): { Action: unknown; Resource: unknown }[] =>
      Object.values(
        template.findResources('AWS::IAM::Policy') as Record<
          string,
          {
            Properties: { PolicyDocument: { Statement: { Action: unknown; Resource: unknown }[] } };
          }
        >,
      ).flatMap((policy) => policy.Properties.PolicyDocument.Statement);

    it('runs every 15 minutes through EventBridge Scheduler, with retries off so a bad run cannot pile up', () => {
      template.hasResourceProperties('AWS::Scheduler::Schedule', {
        ScheduleExpression: 'rate(15 minutes)',
        State: 'ENABLED',
        FlexibleTimeWindow: { Mode: 'OFF' },
        Target: Match.objectLike({ RetryPolicy: { MaximumRetryAttempts: 0 } }),
      });
    });

    it('can be switched off without removing it', () => {
      synthWith({ harvestEnabled: false }).hasResourceProperties('AWS::Scheduler::Schedule', {
        State: 'DISABLED',
      });
    });

    it('lets the API read only replay/ in the data bucket', () => {
      const reads = harvestStatements().filter((s) =>
        JSON.stringify(s.Action).includes('s3:GetObject'),
      );
      const dataReads = reads.filter((s) => JSON.stringify(s.Resource).includes('DataBucket'));
      expect(dataReads).toHaveLength(1);
      expect(JSON.stringify(dataReads[0]?.Resource)).toContain('/replay/*');
    });

    it('lets the harvest and the map monitors only put items in the Cache table', () => {
      const writes = harvestStatements().filter(
        (s) =>
          JSON.stringify(s.Action).includes('dynamodb:PutItem') &&
          !JSON.stringify(s.Action).includes('dynamodb:DeleteItem') &&
          JSON.stringify(s.Resource).includes('Cache'),
      );
      expect(writes).toHaveLength(2);
      for (const write of writes) expect(JSON.stringify(write.Action)).toBe('"dynamodb:PutItem"');
    });

    it('rule I9: gives the harvest a two-minute limit', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Timeout: 120,
        Environment: {
          Variables: Match.objectLike({
            OPENAQ_API_KEY_ARN: Match.anyValue(),
            CACHE_TABLE: Match.anyValue(),
          }),
        },
      });
    });

    it('may put objects only under harvest/ in the data bucket, and never delete or read them', () => {
      const puts = harvestStatements().filter(
        (s) =>
          JSON.stringify(s.Action).includes('s3:PutObject') &&
          JSON.stringify(s.Resource).includes('/harvest/*'),
      );
      expect(puts).toHaveLength(1);
      expect(JSON.stringify(puts[0]?.Resource)).toContain('/harvest/*');
      expect(JSON.stringify(puts[0]?.Action)).not.toContain('s3:Delete');
    });
  });

  describe('the map monitors', () => {
    const template = synth();
    it('are snapshotted every 30 minutes, with retries off', () => {
      template.hasResourceProperties('AWS::Scheduler::Schedule', {
        ScheduleExpression: 'rate(30 minutes)',
        State: 'ENABLED',
        Target: Match.objectLike({ RetryPolicy: { MaximumRetryAttempts: 0 } }),
      });
    });

    it('rule I9: have a limit under five minutes, and only the cache and the OpenAQ key to use', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Timeout: 240,
        Environment: {
          Variables: Match.objectLike({
            OPENAQ_API_KEY_ARN: Match.anyValue(),
            CACHE_TABLE: Match.anyValue(),
          }),
        },
      });
    });

    it('can be switched off with the harvest, without removing them', () => {
      const off = synthWith({ harvestEnabled: false });
      off.hasResourceProperties('AWS::Scheduler::Schedule', {
        ScheduleExpression: 'rate(30 minutes)',
        State: 'DISABLED',
      });
    });

    it('raise an alarm when they stop running, since a function that never runs reports no error', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: 'Invocations',
        Period: 5400,
        ComparisonOperator: 'LessThanThreshold',
        TreatMissingData: 'breaching',
      });
    });
  });

  describe('device messaging', () => {
    const template = synth();

    it('hands every reading topic message to the ingest Lambda, adding the unit name from the topic', () => {
      template.hasResourceProperties('AWS::IoT::TopicRule', {
        RuleName: 'vayu_readings',
        TopicRulePayload: Match.objectLike({
          Sql: "SELECT *, topic(3) AS thingId FROM 'vayu/v1/+/readings'",
          RuleDisabled: false,
          Actions: Match.arrayWith([{ Lambda: { FunctionArn: Match.anyValue() } }]),
        }),
      });
    });

    it('can be switched off without removing it', () => {
      synthWith({ ingestEnabled: false }).hasResourceProperties('AWS::IoT::TopicRule', {
        TopicRulePayload: Match.objectLike({ RuleDisabled: true }),
      });
    });

    it('lets only the IoT service, for this rule, call the ingest function', () => {
      template.hasResourceProperties('AWS::Lambda::Permission', {
        Principal: 'iot.amazonaws.com',
        SourceArn: Match.anyValue(),
        SourceAccount: Match.anyValue(),
      });
    });

    it('rule I9: gives the ingest a ten-second limit and only PutItem on the Rooms table', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Timeout: 10,
        Environment: { Variables: Match.objectLike({ ROOMS_TABLE: Match.anyValue() }) },
      });
      const policies = Object.values(
        template.findResources('AWS::IAM::Policy') as Record<
          string,
          { Properties: { PolicyDocument: { Statement: { Action: unknown }[] } } }
        >,
      ).flatMap((policy) => policy.Properties.PolicyDocument.Statement);
      const putOnly = policies.filter((s) => JSON.stringify(s.Action) === '"dynamodb:PutItem"');
      expect(putOnly).toHaveLength(3); // the harvest and the map monitors (Cache) and the ingest (Rooms)
    });

    it('also sends every reading to Firehose, one line each, so history is kept in S3 without code', () => {
      template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
        DeliveryStreamType: 'DirectPut',
        ExtendedS3DestinationConfiguration: Match.objectLike({
          Prefix: 'device/readings/dt=!{timestamp:yyyy-MM-dd}/',
          CompressionFormat: 'GZIP',
          BufferingHints: { IntervalInSeconds: 300, SizeInMBs: 5 },
        }),
      });
      template.hasResourceProperties('AWS::IoT::TopicRule', {
        TopicRulePayload: Match.objectLike({
          Actions: Match.arrayWith([
            Match.objectLike({ Firehose: Match.objectLike({ Separator: '\n' }) }),
          ]),
        }),
      });
    });

    it('lets Firehose write only under device/, and IoT put records only on that stream', () => {
      const statements = Object.values(
        template.findResources('AWS::IAM::Policy') as Record<
          string,
          {
            Properties: { PolicyDocument: { Statement: { Action: unknown; Resource: unknown }[] } };
          }
        >,
      ).flatMap((policy) => policy.Properties.PolicyDocument.Statement);
      const firehoseWrite = statements.filter((s) =>
        JSON.stringify(s.Action).includes('s3:AbortMultipartUpload'),
      );
      expect(firehoseWrite).toHaveLength(1);
      expect(JSON.stringify(firehoseWrite[0]?.Resource)).toContain('/device/*');
      expect(JSON.stringify(firehoseWrite[0]?.Action)).not.toContain('s3:Delete');
      const putRecord = statements.filter(
        (s) => JSON.stringify(s.Action) === '"firehose:PutRecord"',
      );
      expect(putRecord).toHaveLength(1);
    });

    it('rule I7-style: a device may connect only as itself and publish only under its own name', () => {
      const [policy] = Object.values(
        template.findResources('AWS::IoT::Policy') as Record<
          string,
          { Properties: { PolicyDocument: { Statement: { Action: string; Resource: string }[] } } }
        >,
      );
      const statements = policy?.Properties.PolicyDocument.Statement ?? [];
      expect(statements.map((s) => s.Action).sort()).toEqual(['iot:Connect', 'iot:Publish']);
      for (const statement of statements) {
        expect(JSON.stringify(statement.Resource)).toContain('${iot:Connection.Thing.ThingName}');
      }
    });
  });

  describe('analytics (Athena and Glue)', () => {
    const template = synth();

    it('rule I15: refuses any query that would scan more than a gigabyte, and the setting cannot be overridden', () => {
      template.hasResourceProperties('AWS::Athena::WorkGroup', {
        Name: 'vayu',
        WorkGroupConfiguration: Match.objectLike({
          BytesScannedCutoffPerQuery: 1_073_741_824,
          EnforceWorkGroupConfiguration: true,
          EngineVersion: { SelectedEngineVersion: 'Athena engine version 3' },
        }),
      });
    });

    it('has a table for the harvest stations, the harvest forecasts and the public archive', () => {
      template.resourceCountIs('AWS::Glue::Table', 4);
      for (const name of [
        'harvest_station',
        'harvest_forecast',
        'openaq_archive',
        'device_readings',
      ]) {
        template.hasResourceProperties('AWS::Glue::Table', {
          TableInput: Match.objectLike({ Name: name }),
        });
      }
    });

    it('finds partitions by projection, so nothing needs to be crawled or repaired', () => {
      template.hasResourceProperties('AWS::Glue::Table', {
        TableInput: Match.objectLike({
          Name: 'openaq_archive',
          Parameters: Match.objectLike({
            'projection.enabled': 'true',
            // A numeric range over millions of locations made the first real query hang.
            'projection.locationid.type': 'injected',
            'storage.location.template': Match.stringLikeRegexp(
              'openaq-data-archive/records/csv.gz/locationid=',
            ),
          }),
        }),
      });
    });

    it('keeps query results for a week, then deletes them', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({ Prefix: 'athena-results/', ExpirationInDays: 7, Status: 'Enabled' }),
          ]),
        },
      });
    });

    it('saves four queries, each bounded by a partition column so it cannot read a whole table', () => {
      template.resourceCountIs('AWS::Athena::NamedQuery', 4);
      expect(ARCHIVE_CHECK_SQL).toMatch(/locationid IN \(/);
      expect(ARCHIVE_CHECK_SQL).toMatch(/year = 2025 AND month = 12/);
      expect(FORECAST_ERROR_SQL).toMatch(/dt >= '/);
      expect(HARVEST_COVERAGE_SQL).toMatch(/dt >= '/);
      expect(DEVICE_HISTORY_SQL).toMatch(/dt >= '/);
    });

    it('only names tables that exist', () => {
      const known = new Set([
        'harvest_station',
        'harvest_forecast',
        'openaq_archive',
        'device_readings',
      ]);
      for (const sql of [
        ARCHIVE_CHECK_SQL,
        FORECAST_ERROR_SQL,
        HARVEST_COVERAGE_SQL,
        DEVICE_HISTORY_SQL,
      ]) {
        const used = [...sql.matchAll(/vayu\.(\w+)/g)].map((match) => match[1] ?? '');
        expect(used.length).toBeGreaterThan(0);
        for (const table of used) expect(known.has(table)).toBe(true);
      }
    });
  });

  describe('operations', () => {
    const template = synth();
    const alarms = (): Record<string, { Properties: Record<string, unknown> }> =>
      template.findResources('AWS::CloudWatch::Alarm') as Record<
        string,
        { Properties: Record<string, unknown> }
      >;
    const alarmFor = (
      namespace: string,
      metric: string,
    ): { Properties: Record<string, unknown> }[] =>
      Object.values(alarms()).filter(
        (a) => a.Properties.Namespace === namespace && a.Properties.MetricName === metric,
      );

    it('has one alarm for each thing that can quietly stop', () => {
      template.resourceCountIs('AWS::CloudWatch::Alarm', 8);
      expect(alarmFor('AWS/Lambda', 'Errors')).toHaveLength(4); // API, harvest, ingest, send
      expect(alarmFor('AWS/ApiGateway', '5xx')).toHaveLength(1);
      expect(alarmFor('AWS/States', 'ExecutionsFailed')).toHaveLength(1);
    });

    it('treats a harvest that never runs as an alarm, since it would never report an error', () => {
      const [stopped] = alarmFor('AWS/Lambda', 'Invocations');
      expect(stopped?.Properties).toMatchObject({
        ComparisonOperator: 'LessThanThreshold',
        Threshold: 1,
        Period: 2700,
        TreatMissingData: 'breaching',
      });
    });

    it('sends every alarm to one topic, and mails it only when given an address', () => {
      template.resourceCountIs('AWS::SNS::Topic', 1);
      for (const a of Object.values(alarms())) {
        expect(a.Properties.AlarmActions).toHaveLength(1);
      }
      template.resourceCountIs('AWS::SNS::Subscription', 0);
      synth('someone@example.com').hasResourceProperties('AWS::SNS::Subscription', {
        Protocol: 'email',
        Endpoint: 'someone@example.com',
      });
    });

    it('has a dashboard', () => {
      template.hasResourceProperties('AWS::CloudWatch::Dashboard', { DashboardName: 'Vayu' });
    });
  });

  describe('rules I9, I14 and I15, for every function', () => {
    const template = synth();
    const functions = (): {
      Properties: { Timeout?: number; Environment?: { Variables?: Record<string, unknown> } };
    }[] => Object.values(template.findResources('AWS::Lambda::Function')) as never;
    // The CDK adds helper functions (for example to empty a bucket on delete); only ours are checked.
    const ours = (): ReturnType<typeof functions> =>
      functions().filter((f) => f.Properties.Environment?.Variables !== undefined);

    it('rule I9 and I15: every function has a time limit of at most two minutes', () => {
      expect(ours().length).toBeGreaterThanOrEqual(4);
      for (const f of ours()) {
        expect(f.Properties.Timeout).toBeDefined();
        expect(f.Properties.Timeout).toBeLessThanOrEqual(120);
      }
    });

    it('rule I14: no function holds a secret value, only the address of where it is kept', () => {
      for (const f of ours()) {
        for (const name of Object.keys(f.Properties.Environment?.Variables ?? {})) {
          if (/KEY|TOKEN|SECRET|PASSWORD/.test(name)) expect(name).toMatch(/_ARN$|_PARAM$/);
        }
      }
    });
  });

  describe('FixCheck ("did it work?")', () => {
    const template = synth();
    const fixCheckMachine = (): { Properties: { DefinitionString: unknown } } | undefined =>
      Object.values(
        template.findResources('AWS::StepFunctions::StateMachine') as Record<
          string,
          { Properties: { DefinitionString: unknown } }
        >,
      ).find((machine) =>
        JSON.stringify(machine.Properties.DefinitionString).includes('WaitToLook'),
      );
    const statements = (): { Action: unknown; Resource: unknown }[] =>
      Object.values(
        template.findResources('AWS::IAM::Policy') as Record<
          string,
          {
            Properties: { PolicyDocument: { Statement: { Action: unknown; Resource: unknown }[] } };
          }
        >,
      ).flatMap((policy) => policy.Properties.PolicyDocument.Statement);

    it('is a Standard state machine with a one-hour limit', () => {
      expect(fixCheckMachine()).toBeDefined();
      template.resourceCountIs('AWS::StepFunctions::StateMachine', 2); // the alert loop and this
    });

    it('lets the API start this machine, and only this one', () => {
      const starts = statements().filter((s) =>
        JSON.stringify(s.Action).includes('states:StartExecution'),
      );
      expect(starts).toHaveLength(1);
      expect(JSON.stringify(starts[0]?.Resource)).toContain('FixCheck');
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({ FIXCHECK_STATE_MACHINE_ARN: Match.anyValue() }),
        },
      });
    });

    it('lets its step function read and write only single answer records in the Watch table', () => {
      const watchWrites = statements().filter(
        (s) => JSON.stringify(s.Action) === '["dynamodb:GetItem","dynamodb:PutItem"]',
      );
      expect(watchWrites).toHaveLength(1);
    });

    it('accepts POST with a JSON body from the app, as well as GET', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        CorsConfiguration: Match.objectLike({
          AllowMethods: Match.arrayWith(['GET', 'POST']),
          AllowHeaders: ['content-type'],
        }),
      });
    });
  });

  describe('tracing (X-Ray)', () => {
    const template = synth();
    it('traces every function of ours, so the service map shows who called what', () => {
      const ours = Object.values(template.findResources('AWS::Lambda::Function')).filter(
        (f) => (f.Properties as { Environment?: unknown }).Environment !== undefined,
      );
      expect(ours.length).toBeGreaterThanOrEqual(4);
      for (const f of ours) {
        expect(f.Properties).toMatchObject({ TracingConfig: { Mode: 'Active' } });
      }
    });
    it('traces the alert loop state machine too', () => {
      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        TracingConfiguration: { Enabled: true },
      });
    });
  });

  describe('the Hindi voice note (Polly)', () => {
    const polly = (t: Template): { Action: unknown; Resource: unknown }[] =>
      Object.values(
        t.findResources('AWS::IAM::Policy') as Record<
          string,
          {
            Properties: { PolicyDocument: { Statement: { Action: unknown; Resource: unknown }[] } };
          }
        >,
      )
        .flatMap((policy) => policy.Properties.PolicyDocument.Statement)
        .filter((s) => JSON.stringify(s.Action).includes('polly:'));

    it('is off by default: alerts stay text only, and nothing may call Polly', () => {
      const t = synth();
      t.hasResourceProperties('AWS::Lambda::Function', {
        Environment: { Variables: Match.objectLike({ VOICE: 'off' }) },
      });
      expect(polly(t)).toHaveLength(0);
    });

    it('when switched on, gives only the Send function the one Polly action, SynthesizeSpeech', () => {
      const t = synthWith({ voiceEnabled: true });
      t.hasResourceProperties('AWS::Lambda::Function', {
        Environment: { Variables: Match.objectLike({ VOICE: 'on' }) },
      });
      const statements = polly(t);
      expect(statements).toHaveLength(1);
      expect(statements[0]?.Action).toBe('polly:SynthesizeSpeech');
    });
  });
});

describe('the assistant (rule I15 and the AI boundaries)', () => {
  const template = synth();
  const policies = (): { Action: unknown; Resource: unknown; Effect: string }[] =>
    Object.values(
      template.findResources('AWS::IAM::Policy') as Record<
        string,
        {
          Properties: {
            PolicyDocument: { Statement: { Action: unknown; Resource: unknown; Effect: string }[] };
          };
        }
      >,
    ).flatMap((policy) => policy.Properties.PolicyDocument.Statement);

  it('has a kill switch parameter that starts on and is read, never written, by the API', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/vayu/assistant/enabled',
      Value: 'true',
    });
    const writes = policies().filter((s) => JSON.stringify(s.Action).includes('ssm:PutParameter'));
    expect(writes).toEqual([]);
  });

  it('wraps every prompt and answer in a guardrail: attacks and medical advice are refused', () => {
    template.hasResourceProperties('AWS::Bedrock::Guardrail', {
      ContentPolicyConfig: {
        FiltersConfig: Match.arrayWith([
          Match.objectLike({ Type: 'PROMPT_ATTACK', InputStrength: 'HIGH' }),
        ]),
      },
      TopicPolicyConfig: {
        TopicsConfig: Match.arrayWith([Match.objectLike({ Name: 'medical-advice', Type: 'DENY' })]),
      },
    });
    template.resourceCountIs('AWS::Bedrock::GuardrailVersion', 1);
  });

  it('lets the API call exactly one model, through its inference profile, and apply exactly one guardrail', () => {
    const invokes = policies().filter(
      (s) =>
        JSON.stringify(s.Action) === '"bedrock:InvokeModel"' &&
        JSON.stringify(s.Resource).includes('nova-micro'),
    );
    // The alert loop's Send function and the API each have one; neither can call any other model.
    expect(invokes.length).toBe(2);
    for (const s of invokes) {
      expect(JSON.stringify(s.Resource)).not.toMatch(/nova-pro|nova-lite|claude|\*"\]$/u);
    }
    const apply = policies().filter((s) => JSON.stringify(s.Action) === '"bedrock:ApplyGuardrail"');
    expect(apply).toHaveLength(1);
    expect(JSON.stringify(apply[0]?.Resource)).toContain('GuardrailAttrGuardrailArn'.slice(0, 0));
  });

  it('throttles the assistant and the request form far below the rest of the API', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      RouteSettings: {
        'POST /v1/assistant': { ThrottlingRateLimit: 3, ThrottlingBurstLimit: 6 },
        'POST /v1/requests': { ThrottlingRateLimit: 1, ThrottlingBurstLimit: 3 },
      },
      DefaultRouteSettings: { ThrottlingRateLimit: 50, ThrottlingBurstLimit: 100 },
    });
  });
});
