import { Logger } from '@aws-lambda-powertools/logger';
import { liveClock } from '@vayu/core';
import { ingestReading, type IngestResult, type RoomStore } from '@vayu/data';
import { dynamoRoomStore } from './roomStores';
import { annotate } from './tracing';

const logger = new Logger({ serviceName: 'vayu-ingest' });

/**
 * One event from the IoT rule: the unit's message with `thingId` added from the topic
 * (`vayu/v1/{thingId}/readings`). The unit name comes from the topic, which IoT policy ties to the
 * unit's own certificate, never from what the message says about itself.
 */
export function ingestEvent(
  event: Readonly<Record<string, unknown>>,
  store: RoomStore,
  receivedAt: string,
): Promise<IngestResult> {
  const { thingId, ...message } = event;
  if (typeof thingId !== 'string') {
    return Promise.resolve({ status: 'rejected', reason: 'the topic carried no unit name' });
  }
  return ingestReading(message, thingId, store, receivedAt);
}

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

let store: RoomStore | undefined;

export async function handler(event: Readonly<Record<string, unknown>>): Promise<IngestResult> {
  store ??= dynamoRoomStore(mustEnv('ROOMS_TABLE'));
  const result = await ingestEvent(event, store, liveClock().now());
  annotate('ingestStatus', result.status);
  // A rejected message is logged and dropped: retrying a bad message cannot make it good.
  logger.info('ingest', {
    status: result.status,
    ...(result.status === 'rejected' ? { reason: result.reason } : {}),
  });
  return result;
}
