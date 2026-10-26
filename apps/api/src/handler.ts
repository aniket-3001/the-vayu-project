import { Logger } from '@aws-lambda-powertools/logger';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { liveClock } from '@vayu/core';
import {
  cachedStationRepo,
  cachedWeatherRepo,
  firmsFireRepo,
  openAqStationRepo,
  openMeteoForecastRepo,
  openMeteoGasRepo,
  openMeteoHistoryRepo,
  openMeteoWeatherForecastRepo,
  metNoWindGridRepo,
  openMeteoAirGridRepo,
  openMeteoWindGridRepo,
  windGridWithFallback,
  openMeteoWeatherRepo,
} from '@vayu/data';
import {
  bedrockGenerator,
  dynamoLinkStore,
  dynamoTokenStore,
  pollyEnglishVoice,
  pollyHindiVoice,
  resumeAlertLoop,
} from '@vayu/watch';
import { ASSISTANT_LIMITS, GROUNDED_SYSTEM_PROMPT } from './assistantAgent';
import { ssmSwitch } from './killSwitch';
import { s3ReplayRepo } from './replayStore';
import { clientAddress } from './clientAddress';
import { dynamoQuota } from './quota';
import { dynamoAccountStore } from './accountStore';
import { dynamoFireReportSave } from './fireReportsStore';
import { dynamoRequestsSave } from './requestsStore';
import { dynamoCacheReader, dynamoRoomStore } from './roomStores';
import { SPEECH_LIMITS } from './speechRoute';
import { dynamoSpeechStore } from './speechStore';
import { startFixCheck } from './fixCheck';
import { dynamoFixCheckStore } from './fixCheckStore';
import { parseAllowList } from './adminGuard';
import { dynamoAnalyticsStore } from './analyticsStore';
import { createRouter, type ApiRequest, type RouterDeps } from './routes';
import { sfnSendTaskSuccess } from './sfnResume';
import { annotate, traced } from './tracing';

const logger = new Logger({ serviceName: 'vayu-api' });
const secretsClient = traced(new SecretsManagerClient({}));
const docClient = DynamoDBDocumentClient.from(traced(new DynamoDBClient({})));

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

async function readSecret(arn: string): Promise<string> {
  const res = await secretsClient.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!res.SecretString) {
    throw new Error(`Secret ${arn} has no string value`);
  }
  return res.SecretString;
}

/**
 * The assistant's model calls: one model, the same guardrail on every prompt and answer, a small token limit, and
 * a kill switch. The first call rewords an answer the rules decided; the second answers from the facts with
 * standing instructions the caller's words cannot change.
 */
function assistantDeps(salt: string, doc: DynamoDBDocumentClient): RouterDeps['assistant'] {
  const client = traced(new BedrockRuntimeClient({ region: 'ap-south-1' }));
  const guardrailId = process.env.GUARDRAIL_ID;
  const common = {
    client,
    modelId: mustEnv('ASSISTANT_MODEL_ID'),
    maxTokens: ASSISTANT_LIMITS.maxOutputTokens,
    ...(guardrailId === undefined
      ? {}
      : { guardrail: { id: guardrailId, version: mustEnv('GUARDRAIL_VERSION') } }),
  };
  return {
    reword: bedrockGenerator(common),
    grounded: bedrockGenerator({ ...common, system: GROUNDED_SYSTEM_PROMPT }),
    enabled: ssmSwitch(mustEnv('ASSISTANT_SWITCH_PARAM')),
    quota: dynamoQuota(mustEnv('WATCH_TABLE'), doc),
    clock: liveClock(),
    salt,
  };
}

// Cold-start-once, reused across invocations in the same execution environment.
let routePromise: Promise<ReturnType<typeof createRouter>> | undefined;

// Real OpenAQ stations (cached) and Open-Meteo forecast; the timeline says 'model' on its own when
// no station has a recent reading (rule I12).
function buildRoute(): Promise<ReturnType<typeof createRouter>> {
  routePromise ??= (async () => {
    const [botToken, webhookSecret, firmsMapKey, openAqKey, requestSalt] = await Promise.all([
      readSecret(mustEnv('TELEGRAM_BOT_TOKEN_ARN')),
      readSecret(mustEnv('TELEGRAM_WEBHOOK_SECRET_ARN')),
      readSecret(mustEnv('FIRMS_MAP_KEY_ARN')),
      readSecret(mustEnv('OPENAQ_API_KEY_ARN')),
      readSecret(mustEnv('REQUEST_SALT_ARN')),
    ]);
    const rooms = {
      store: dynamoRoomStore(mustEnv('ROOMS_TABLE')),
      cache: dynamoCacheReader(mustEnv('CACHE_TABLE')),
    };
    const fixCheckStore = dynamoFixCheckStore(mustEnv('WATCH_TABLE'));
    const sfn = traced(new SFNClient({}));
    const analyticsStore = dynamoAnalyticsStore(mustEnv('WATCH_TABLE'), docClient);
    const deps: RouterDeps = {
      // OpenAQ allows 60 requests a minute; cache for 15 minutes so request volume cannot hit it.
      stationRepo: cachedStationRepo(openAqStationRepo({ apiKey: openAqKey }), 15 * 60_000),
      forecastRepo: openMeteoForecastRepo(),
      weatherRepo: cachedWeatherRepo(openMeteoWeatherRepo(), 15 * 60_000),
      weatherForecastRepo: openMeteoWeatherForecastRepo(),
      // Open-Meteo first; MET Norway when it has run out of allowance.
      airGridRepo: openMeteoAirGridRepo(),
      windRepo: windGridWithFallback(openMeteoWindGridRepo(), metNoWindGridRepo()),
      gasRepo: openMeteoGasRepo(),
      historyRepo: openMeteoHistoryRepo(),
      fireRepo: firmsFireRepo({ mapKey: firmsMapKey }),
      fireMode: 'live',
      replayRepo: s3ReplayRepo(mustEnv('DATA_BUCKET')),
      rooms,
      fixChecks: {
        store: fixCheckStore,
        start: (input) =>
          startFixCheck(input, {
            rooms,
            store: fixCheckStore,
            now: () => new Date().toISOString(),
            startExecution: async (name, state) => {
              await sfn.send(
                new StartExecutionCommand({
                  stateMachineArn: mustEnv('FIXCHECK_STATE_MACHINE_ARN'),
                  name,
                  input: JSON.stringify(state),
                }),
              );
            },
          }),
      },
      cache: dynamoCacheReader(mustEnv('CACHE_TABLE')),
      assistant: assistantDeps(requestSalt, docClient),
      speech: {
        voice: pollyEnglishVoice({ maxCharacters: SPEECH_LIMITS.maxCharacters }),
        voiceHindi: pollyHindiVoice({ maxCharacters: SPEECH_LIMITS.maxCharacters }),
        enabled: ssmSwitch(mustEnv('ASSISTANT_SWITCH_PARAM')),
        quota: dynamoQuota(mustEnv('WATCH_TABLE'), docClient),
        store: dynamoSpeechStore(mustEnv('WATCH_TABLE'), docClient),
        clock: liveClock(),
        salt: requestSalt,
      },
      fireReports: {
        save: dynamoFireReportSave(mustEnv('WATCH_TABLE'), docClient),
        quota: dynamoQuota(mustEnv('WATCH_TABLE'), docClient),
        clock: liveClock(),
        salt: requestSalt,
      },
      requests: {
        save: dynamoRequestsSave(mustEnv('WATCH_TABLE'), docClient),
        quota: dynamoQuota(mustEnv('WATCH_TABLE'), docClient),
        clock: liveClock(),
        salt: requestSalt,
      },
      account: {
        store: dynamoAccountStore(mustEnv('WATCH_TABLE'), docClient),
        clock: liveClock(),
        onDelete: (userId) => analyticsStore.removeUser(userId),
      },
      analytics: {
        store: analyticsStore,
        quota: dynamoQuota(mustEnv('WATCH_TABLE'), docClient),
        clock: liveClock(),
        salt: requestSalt,
        admins: parseAllowList(process.env.ADMIN_EMAILS),
      },
      ...(process.env.USER_POOL_ID && process.env.USER_POOL_CLIENT_ID
        ? {
            authConfig: {
              userPoolId: process.env.USER_POOL_ID,
              clientId: process.env.USER_POOL_CLIENT_ID,
              region: process.env.AWS_REGION ?? 'ap-south-1',
            },
          }
        : {}),
      clock: liveClock(),
      mode: 'live',
      linkStore: dynamoLinkStore({ tableName: mustEnv('WATCH_TABLE'), docClient }),
      // A first-time tap resumes the alert loop waiting on it (Step Functions task token).
      onFirstAck: resumeAlertLoop({
        tokens: dynamoTokenStore({ tableName: mustEnv('WATCH_TABLE'), docClient }),
        sendTaskSuccess: sfnSendTaskSuccess(sfn),
      }),
      telegram: { botToken, webhookSecret },
    };
    return createRouter(deps);
  })();
  return routePromise;
}

/** The signed-in person's id, from the claims API Gateway verified. Never from the request's own headers or body. */
function userIdOf(event: APIGatewayProxyEventV2): string | undefined {
  const sub = (
    event.requestContext as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } }
  ).authorizer?.jwt?.claims?.sub;
  return typeof sub === 'string' && sub !== '' ? sub : undefined;
}

/** The signed-in person's email and whether it is verified, from the claims API Gateway verified. */
function emailOf(event: APIGatewayProxyEventV2): { email?: string; emailVerified?: boolean } {
  const claims = (
    event.requestContext as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } }
  ).authorizer?.jwt?.claims;
  const email = claims?.email;
  if (typeof email !== 'string' || email === '') return {};
  return { email, emailVerified: claims?.email_verified === 'true' || claims?.email_verified === true };
}

/** The thin AWS adapter around the router. */
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const route = await buildRoute();
  const userId = userIdOf(event);
  const request: ApiRequest = {
    method: event.requestContext.http.method,
    path: event.rawPath,
    query: event.queryStringParameters ?? {},
    headers: event.headers,
    sourceIp: clientAddress(event.headers, event.requestContext.http.sourceIp),
    // Set only by API Gateway's JWT authorizer, on the routes that have one.
    ...(userId === undefined ? {} : { userId }),
    ...(userId === undefined ? {} : emailOf(event)),
    ...(event.body === undefined ? {} : { body: event.body }),
  };
  const response = await route(request);
  annotate('path', request.path);
  annotate('status', response.statusCode);
  logger.info('request', {
    method: request.method,
    path: request.path,
    status: response.statusCode,
  });
  return {
    statusCode: response.statusCode,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      // A route that moves slowly says how long a shared cache may keep it; it overrides the default above.
      ...response.headers,
    },
    body: JSON.stringify(response.body),
  };
}
