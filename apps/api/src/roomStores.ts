import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { Reading } from '@vayu/contracts';
import { toMs } from '@vayu/core';
import { ForecastSnapshot, StationSnapshot, type RoomStore } from '@vayu/data';
import { z } from 'zod';
import { traced } from './tracing';

type Doc = Pick<DynamoDBDocumentClient, 'send'>;
const defaultClient = (): Doc => DynamoDBDocumentClient.from(traced(new DynamoDBClient({})));

/** The sort key sorts by time, then by sequence, so a time range is one cheap query. */
const sortKey = (reading: Reading, seq: number): string =>
  `R#${reading.ts}#${String(seq).padStart(6, '0')}`;
const seqOf = (reading: Reading): number => Number(reading.id.split('#').at(-1));

/** Room readings in the Rooms table: `ROOM#<unit>` and `R#<time>#<seq>`, expiring by themselves. */
export function dynamoRoomStore(tableName: string, client: Doc = defaultClient()): RoomStore {
  return {
    async putReading(thingId, reading, expiresAtEpochSeconds) {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              pk: `ROOM#${thingId}`,
              sk: sortKey(reading, seqOf(reading)),
              expiresAt: expiresAtEpochSeconds,
              reading,
            },
            // The same unit, time and sequence is the same reading: a second delivery changes nothing.
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        );
        return 'stored';
      } catch (error) {
        if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
          return 'duplicate';
        }
        throw error;
      }
    },
    async readingsSince(thingId, sinceIso) {
      const out = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk AND sk >= :from',
          ExpressionAttributeValues: { ':pk': `ROOM#${thingId}`, ':from': `R#${sinceIso}` },
          ScanIndexForward: false,
          // Ten-second readings: 30 minutes is 180 rows.
          Limit: 250,
        }),
      );
      return z
        .array(z.object({ reading: Reading }))
        .parse(out.Items ?? [])
        .map((row) => row.reading);
    },
  };
}

export interface CacheReader {
  /** The harvest's latest answer for a place, or undefined when there is none or it has expired. */
  latest(placeId: string, asOf: string): Promise<StationSnapshot | undefined>;
  /** The forecast the harvest last recorded for a place, under the same rules. */
  latestForecast(placeId: string, asOf: string): Promise<ForecastSnapshot | undefined>;
  /** The monitors the map shows, as the last scheduled snapshot left them. */
  stations?(asOf: string): Promise<unknown>;
}

/** Reads what the harvest wrote to the Cache table (`LATEST#<place>`). */
export function dynamoCacheReader(tableName: string, client: Doc = defaultClient()): CacheReader {
  const read = async (key: string, asOf: string): Promise<unknown> => {
    const out = await client.send(new GetCommand({ TableName: tableName, Key: { pk: key } }));
    const item = out.Item as { value?: unknown; expiresAt?: number } | undefined;
    if (item === undefined) return undefined;
    // DynamoDB removes expired items lazily, sometimes a day or two late, so check ourselves.
    if (item.expiresAt !== undefined && item.expiresAt * 1000 <= toMs(asOf)) return undefined;
    return item.value;
  };
  return {
    async latest(placeId, asOf) {
      const value = await read(`LATEST#${placeId}`, asOf);
      return value === undefined ? undefined : StationSnapshot.parse(value);
    },
    stations: (asOf) => read('STATIONS#north-india', asOf),
    async latestForecast(placeId, asOf) {
      const value = await read(`FORECAST#${placeId}`, asOf);
      return value === undefined ? undefined : ForecastSnapshot.parse(value);
    },
  };
}
