import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { traced } from './tracing';

/** What a person has saved: the settings and places the app keeps on a device, as text, and when it was saved. */
export interface SavedProfile {
  readonly profile: Readonly<Record<string, string>>;
  readonly updatedAt: string;
}

export interface AccountStore {
  readonly read: (userId: string) => Promise<SavedProfile | undefined>;
  readonly write: (userId: string, saved: SavedProfile) => Promise<void>;
  readonly remove: (userId: string) => Promise<void>;
}

const keyOf = (userId: string): { pk: string; sk: string } => ({
  pk: `ACCOUNT#${userId}`,
  sk: 'PROFILE',
});

/** One item per person in the Watch table. It has no expiry: it stays until the person deletes it. */
export function dynamoAccountStore(
  tableName: string,
  client: DynamoDBDocumentClient = DynamoDBDocumentClient.from(traced(new DynamoDBClient({}))),
): AccountStore {
  return {
    async read(userId) {
      const out = await client.send(new GetCommand({ TableName: tableName, Key: keyOf(userId) }));
      const item = out.Item as { profile?: Record<string, string>; updatedAt?: string } | undefined;
      if (item?.profile === undefined || item.updatedAt === undefined) return undefined;
      return { profile: item.profile, updatedAt: item.updatedAt };
    },
    async write(userId, saved) {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: { ...keyOf(userId), profile: saved.profile, updatedAt: saved.updatedAt },
        }),
      );
    },
    async remove(userId) {
      await client.send(new DeleteCommand({ TableName: tableName, Key: keyOf(userId) }));
    },
  };
}
