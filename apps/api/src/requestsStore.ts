import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { AccessRequest } from '@vayu/contracts';
import { traced } from './tracing';

/** Requests for a demo or monitors are kept for 180 days, then DynamoDB deletes them itself. */
const KEEP_SECONDS = 180 * 86_400;

export function dynamoRequestsSave(
  tableName: string,
  client: DynamoDBDocumentClient = DynamoDBDocumentClient.from(traced(new DynamoDBClient({}))),
): (id: string, request: AccessRequest, receivedAt: string) => Promise<void> {
  return async (id, request, receivedAt) => {
    await client
      .send(
        new PutCommand({
          TableName: tableName,
          Item: {
            pk: `REQUEST#${id}`,
            sk: 'REQUEST',
            ...request,
            receivedAt,
            expiresAt: Math.floor(Date.parse(receivedAt) / 1000) + KEEP_SECONDS,
          },
          // A repeat of the same request (same id) is not stored twice.
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      )
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error;
      });
  };
}
