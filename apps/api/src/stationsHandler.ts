import { Logger } from '@aws-lambda-powertools/logger';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { liveClock } from '@vayu/core';
import { openAqMapStationRepo } from '@vayu/data';
import { dynamoCacheStore } from './harvestStores';
import { STATION_CHUNKS, STATIONS_TTL_SECONDS, snapshotStations } from './stationsSnapshot';
import { annotate, traced } from './tracing';

const logger = new Logger({ serviceName: 'vayu-stations' });

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * The scheduled snapshot of the monitors on the map, worldwide (EventBridge Scheduler, every 30 minutes). It reads
 * OpenAQ's list of the latest PM2.5 a thousand at a time, spaced to stay under the provider's limit, so a visitor
 * opening the map never reaches OpenAQ.
 */
export async function handler(): Promise<{ readonly stations: number }> {
  const secret = await traced(new SecretsManagerClient({})).send(
    new GetSecretValueCommand({ SecretId: mustEnv('OPENAQ_API_KEY_ARN') }),
  );
  if (!secret.SecretString) throw new Error('The OpenAQ secret has no value');
  const result = await snapshotStations({
    // About ten pages of a thousand readings, a request a second: well inside the function's two-minute limit.
    repo: openAqMapStationRepo({ apiKey: secret.SecretString, budgetMs: 95_000 }),
    cache: dynamoCacheStore(mustEnv('CACHE_TABLE')),
    now: liveClock().now(),
  });
  annotate('stations', result.stations);
  logger.info('stations snapshot done', {
    ...result,
    chunks: STATION_CHUNKS,
    ttl: STATIONS_TTL_SECONDS,
  });
  return result;
}
