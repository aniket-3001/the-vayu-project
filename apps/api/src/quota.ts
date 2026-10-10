import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { traced } from './tracing';

/**
 * A counter that says no once a limit is used up. It is how the public routes keep abuse and cost bounded
 * (rule I15): each caller, and the whole service, can only do so much a day.
 */
export interface Quota {
  /** Uses one of `limit` for `key`. False means the limit is used up and the caller must not go ahead. */
  take(key: string, limit: number, ttlSeconds: number): Promise<boolean>;
}

/** A quota that lives in memory, for tests and for local runs. */
export function memoryQuota(): Quota & { readonly used: (key: string) => number } {
  const counts = new Map<string, number>();
  return {
    take(key, limit) {
      const used = counts.get(key) ?? 0;
      if (used >= limit) return Promise.resolve(false);
      counts.set(key, used + 1);
      return Promise.resolve(true);
    },
    used: (key) => counts.get(key) ?? 0,
  };
}

/**
 * The same in DynamoDB: one atomic update per call, so two requests at once cannot both take the last one. The
 * counter item deletes itself after its time to live, so nothing piles up.
 */
export function dynamoQuota(
  tableName: string,
  client: DynamoDBDocumentClient = DynamoDBDocumentClient.from(traced(new DynamoDBClient({}))),
  nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
): Quota {
  return {
    async take(key, limit, ttlSeconds) {
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: `CAP#${key}`, sk: 'CAP' },
            UpdateExpression: 'ADD used :one SET expiresAt = if_not_exists(expiresAt, :expires)',
            ConditionExpression: 'attribute_not_exists(used) OR used < :limit',
            ExpressionAttributeValues: {
              ':one': 1,
              ':limit': limit,
              ':expires': nowSeconds() + ttlSeconds,
            },
          }),
        );
        return true;
      } catch (error) {
        if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
        throw error;
      }
    },
  };
}

/** The India calendar date of an instant, "2026-10-10": counters reset at midnight there. */
export const dayKey = (iso: string): string =>
  new Date(Date.parse(iso) + 5.5 * 3_600_000).toISOString().slice(0, 10);
