import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  type DynamoDBDocumentClient as DocClient,
} from '@aws-sdk/lib-dynamodb';

const WEEK_SECONDS = 7 * 24 * 3600;

/**
 * Holds the Step Functions task token of the step an alert is currently waiting on. One live token
 * per alert: each new step overwrites the last, and a tap resumes whatever is waiting now.
 */
export interface TokenStore {
  saveToken(alertId: string, token: string, nowMs: number): Promise<void>;
  getToken(alertId: string): Promise<string | null>;
  deleteToken(alertId: string): Promise<void>;
}

export function fixtureTokenStore(): TokenStore {
  const tokens = new Map<string, string>();
  return {
    saveToken(alertId, token) {
      tokens.set(alertId, token);
      return Promise.resolve();
    },
    getToken(alertId) {
      return Promise.resolve(tokens.get(alertId) ?? null);
    },
    deleteToken(alertId) {
      tokens.delete(alertId);
      return Promise.resolve();
    },
  };
}

const tokenKey = (alertId: string): { pk: string; sk: 'CURRENT' } => ({
  pk: `TOKEN#${alertId}`,
  sk: 'CURRENT',
});

export interface DynamoTokenStoreOptions {
  readonly tableName: string;
  readonly docClient?: Pick<DocClient, 'send'>;
}

/** Token store on the existing `Watch` table; items expire after 7 days (TTL on `expiresAt`). */
export function dynamoTokenStore(options: DynamoTokenStoreOptions): TokenStore {
  const doc = options.docClient ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const table = options.tableName;
  return {
    async saveToken(alertId, token, nowMs) {
      await doc.send(
        new PutCommand({
          TableName: table,
          Item: {
            ...tokenKey(alertId),
            token,
            expiresAt: Math.floor(nowMs / 1000) + WEEK_SECONDS,
          },
        }),
      );
    },
    async getToken(alertId) {
      const result = await doc.send(new GetCommand({ TableName: table, Key: tokenKey(alertId) }));
      const token = (result.Item as { token?: unknown } | undefined)?.token;
      return typeof token === 'string' ? token : null;
    },
    async deleteToken(alertId) {
      await doc.send(new DeleteCommand({ TableName: table, Key: tokenKey(alertId) }));
    },
  };
}
