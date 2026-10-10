import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { FireReport } from '@vayu/contracts';
import { traced } from './tracing';

/** Fire reports are kept for 180 days, then DynamoDB deletes them itself. */
const KEEP_SECONDS = 180 * 86_400;

export function dynamoFireReportSave(
  tableName: string,
  client: DynamoDBDocumentClient = DynamoDBDocumentClient.from(traced(new DynamoDBClient({}))),
): (id: string, report: FireReport, receivedAt: string) => Promise<void> {
  return async (id, report, receivedAt) => {
    await client
      .send(
        new PutCommand({
          TableName: tableName,
          Item: {
            pk: `FIREREPORT#${id}`,
            sk: 'FIREREPORT',
            ...report,
            receivedAt,
            expiresAt: Math.floor(Date.parse(receivedAt) / 1000) + KEEP_SECONDS,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      )
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error;
      });
  };
}
