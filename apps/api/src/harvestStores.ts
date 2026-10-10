import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { CacheStore, SnapshotStore } from '@vayu/data';
import { traced } from './tracing';

/** Raw harvest lines go to a private S3 bucket. */
export function s3SnapshotStore(
  bucket: string,
  client: S3Client = traced(new S3Client({})),
): SnapshotStore {
  return {
    async put(key, body) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: 'application/x-ndjson',
        }),
      );
    },
  };
}

/** The latest answer per place goes to the Cache table; DynamoDB deletes it itself after `expiresAt`. */
export function dynamoCacheStore(
  tableName: string,
  client: DynamoDBDocumentClient = DynamoDBDocumentClient.from(traced(new DynamoDBClient({}))),
): CacheStore {
  return {
    async put(key, value, expiresAtEpochSeconds) {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: { pk: key, value, expiresAt: expiresAtEpochSeconds },
        }),
      );
    },
  };
}
