import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { SpeechStore } from './speechRoute';
import { traced } from './tracing';

/** Spoken answers kept for a day in the Watch table, which deletes them itself after `expiresAt`. */
export function dynamoSpeechStore(
  tableName: string,
  client: DynamoDBDocumentClient = DynamoDBDocumentClient.from(traced(new DynamoDBClient({}))),
  nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
): SpeechStore {
  return {
    async get(key) {
      const out = await client.send(
        new GetCommand({ TableName: tableName, Key: { pk: key, sk: 'AUDIO' } }),
      );
      const item = out.Item as { audio?: string; expiresAt?: number } | undefined;
      if (item?.audio === undefined) return undefined;
      // DynamoDB removes expired items lazily, so check the time ourselves.
      if (item.expiresAt !== undefined && item.expiresAt <= nowSeconds()) return undefined;
      return item.audio;
    },
    async put(key, audioBase64, ttlSeconds) {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: { pk: key, sk: 'AUDIO', audio: audioBase64, expiresAt: nowSeconds() + ttlSeconds },
        }),
      );
    },
  };
}
