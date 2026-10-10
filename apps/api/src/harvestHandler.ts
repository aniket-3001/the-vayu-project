import { Logger } from '@aws-lambda-powertools/logger';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { DEMO_PLACES } from '@vayu/contracts';
import { liveClock } from '@vayu/core';
import {
  harvestOnce,
  openAqStationRepo,
  openMeteoForecastRepo,
  type HarvestSummary,
} from '@vayu/data';
import { dynamoCacheStore, s3SnapshotStore } from './harvestStores';
import { annotate, traced } from './tracing';

const logger = new Logger({ serviceName: 'vayu-harvest' });

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * The scheduled harvest (EventBridge Scheduler, every 15 minutes). The only thing that talks to
 * OpenAQ on a clock, so the provider's limits are never reached by visitors.
 */
export async function handler(): Promise<HarvestSummary> {
  const secret = await traced(new SecretsManagerClient({})).send(
    new GetSecretValueCommand({ SecretId: mustEnv('OPENAQ_API_KEY_ARN') }),
  );
  if (!secret.SecretString) throw new Error('The OpenAQ secret has no value');

  const summary = await harvestOnce({
    places: DEMO_PLACES,
    stationRepo: openAqStationRepo({ apiKey: secret.SecretString }),
    forecastRepo: openMeteoForecastRepo(),
    snapshots: s3SnapshotStore(mustEnv('DATA_BUCKET')),
    cache: dynamoCacheStore(mustEnv('CACHE_TABLE')),
    now: liveClock().now(),
  });
  annotate('placesWithStation', summary.withStation);
  annotate('placesWithoutStation', summary.withoutStation);
  logger.info('harvest done', { ...summary });
  return summary;
}
