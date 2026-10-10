import { Logger } from '@aws-lambda-powertools/logger';
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
  openMeteoWeatherRepo,
} from '@vayu/data';
import { dynamoLinkStore, dynamoTokenStore, resumeAlertLoop } from '@vayu/watch';
import { s3ReplayRepo } from './replayStore';
import { dynamoCacheReader, dynamoRoomStore } from './roomStores';
import { startFixCheck } from './fixCheck';
import { dynamoFixCheckStore } from './fixCheckStore';
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

// Cold-start-once, reused across invocations in the same execution environment.
let routePromise: Promise<ReturnType<typeof createRouter>> | undefined;

// Real OpenAQ stations (cached) and Open-Meteo forecast; the timeline says 'model' on its own when
// no station has a recent reading (rule I12).
function buildRoute(): Promise<ReturnType<typeof createRouter>> {
  routePromise ??= (async () => {
    const [botToken, webhookSecret, firmsMapKey, openAqKey] = await Promise.all([
      readSecret(mustEnv('TELEGRAM_BOT_TOKEN_ARN')),
      readSecret(mustEnv('TELEGRAM_WEBHOOK_SECRET_ARN')),
      readSecret(mustEnv('FIRMS_MAP_KEY_ARN')),
      readSecret(mustEnv('OPENAQ_API_KEY_ARN')),
    ]);
    const rooms = {
      store: dynamoRoomStore(mustEnv('ROOMS_TABLE')),
      cache: dynamoCacheReader(mustEnv('CACHE_TABLE')),
    };
    const fixCheckStore = dynamoFixCheckStore(mustEnv('WATCH_TABLE'));
    const sfn = traced(new SFNClient({}));
    const deps: RouterDeps = {
      // OpenAQ allows 60 requests a minute; cache for 15 minutes so request volume cannot hit it.
      stationRepo: cachedStationRepo(openAqStationRepo({ apiKey: openAqKey }), 15 * 60_000),
      forecastRepo: openMeteoForecastRepo(),
      weatherRepo: cachedWeatherRepo(openMeteoWeatherRepo(), 15 * 60_000),
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

/** The thin AWS adapter around the router. */
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const route = await buildRoute();
  const request: ApiRequest = {
    method: event.requestContext.http.method,
    path: event.rawPath,
    query: event.queryStringParameters ?? {},
    headers: event.headers,
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
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(response.body),
  };
}
