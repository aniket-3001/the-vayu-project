import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { FixCheckResult } from '@vayu/contracts';
import { z } from 'zod';
import { traced } from './tracing';
import type { FixCheckStore } from './fixCheck';

const KEEP_SECONDS = 7 * 24 * 3600;
const key = (id: string): { pk: string; sk: 'RESULT' } => ({ pk: `FIXCHECK#${id}`, sk: 'RESULT' });
const expiry = (): number => Math.floor(Date.now() / 1000) + KEEP_SECONDS;

/** "Did it work?" answers in the Watch table (`FIXCHECK#<id>`), kept a week and then expired by DynamoDB. */
export function dynamoFixCheckStore(
  tableName: string,
  client: Pick<DynamoDBDocumentClient, 'send'> = DynamoDBDocumentClient.from(
    traced(new DynamoDBClient({})),
  ),
): FixCheckStore {
  const item = (result: FixCheckResult): Record<string, unknown> => ({
    ...key(result.fixCheckId),
    expiresAt: expiry(),
    result,
  });
  return {
    async create(result) {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: item(result),
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        );
        return 'created';
      } catch (error) {
        if (error instanceof Error && error.name === 'ConditionalCheckFailedException')
          return 'exists';
        throw error;
      }
    },
    async get(fixCheckId) {
      const out = await client.send(new GetCommand({ TableName: tableName, Key: key(fixCheckId) }));
      if (out.Item === undefined) return undefined;
      return z.object({ result: FixCheckResult }).parse(out.Item).result;
    },
    async save(result) {
      await client.send(new PutCommand({ TableName: tableName, Item: item(result) }));
    },
  };
}
