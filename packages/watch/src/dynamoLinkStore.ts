import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { toMs } from '@vayu/core';
import type { AckRecord, Link, LinkCode, LinkStore } from './linking';

export interface DynamoLinkStoreOptions {
  readonly tableName: string;
  readonly docClient?: DynamoDBDocumentClient;
}

interface LinkCodeItem {
  readonly pk: string;
  readonly sk: 'META';
  readonly groupId: string;
  readonly role: string;
  readonly expiresAtIso: string;
  /** TTL attribute (epoch seconds) — DynamoDB deletes this item itself once it's past. */
  readonly expiresAt: number;
}

interface LinkItem {
  readonly pk: string;
  readonly sk: 'META';
  readonly groupId: string;
  readonly role: string;
  readonly linkedAt: string;
}

interface RoleIndexItem {
  readonly pk: string;
  readonly sk: string;
  readonly chatId: string;
}

const linkCodeKey = (code: string): { pk: string; sk: 'META' } => ({
  pk: `LINKCODE#${code}`,
  sk: 'META',
});
const linkKey = (chatId: string): { pk: string; sk: 'META' } => ({
  pk: `LINK#${chatId}`,
  sk: 'META',
});
const roleIndexPk = (groupId: string, role: string): string => `ROLE#${groupId}#${role}`;
const sendClaimKey = (
  alertId: string,
  chatId: string,
  step: string,
): { pk: string; sk: string } => ({
  pk: `SENDCLAIM#${alertId}`,
  sk: `${chatId}#${step}`,
});
const sentKey = (alertId: string, chatId: string, action: string): { pk: string; sk: string } => ({
  pk: `SENT#${alertId}`,
  sk: `${chatId}#${action}`,
});

/** The real `LinkStore`, backed by the already-deployed `Watch` table (single-table, pk/sk, TTL on `expiresAt`). */
export function dynamoLinkStore(options: DynamoLinkStoreOptions): LinkStore {
  const doc = options.docClient ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const table = options.tableName;

  return {
    async saveLinkCode(linkCode: LinkCode): Promise<void> {
      const item: LinkCodeItem = {
        ...linkCodeKey(linkCode.code),
        groupId: linkCode.groupId,
        role: linkCode.role,
        expiresAtIso: linkCode.expiresAt,
        expiresAt: Math.floor(toMs(linkCode.expiresAt) / 1000),
      };
      await doc.send(new PutCommand({ TableName: table, Item: item }));
    },

    async getLinkCode(code: string): Promise<LinkCode | null> {
      const res = await doc.send(new GetCommand({ TableName: table, Key: linkCodeKey(code) }));
      const item = res.Item as LinkCodeItem | undefined;
      if (!item) {
        return null;
      }
      return { code, groupId: item.groupId, role: item.role, expiresAt: item.expiresAtIso };
    },

    async consumeLinkCode(code: string): Promise<void> {
      await doc.send(new DeleteCommand({ TableName: table, Key: linkCodeKey(code) }));
    },

    async saveLink(link: Link): Promise<void> {
      const item: LinkItem = {
        ...linkKey(link.chatId),
        groupId: link.groupId,
        role: link.role,
        linkedAt: link.linkedAt,
      };
      const index: RoleIndexItem = {
        pk: roleIndexPk(link.groupId, link.role),
        sk: `LINK#${link.chatId}`,
        chatId: link.chatId,
      };
      await Promise.all([
        doc.send(new PutCommand({ TableName: table, Item: item })),
        doc.send(new PutCommand({ TableName: table, Item: index })),
      ]);
    },

    async deleteLink(chatId: string): Promise<void> {
      const res = await doc.send(new GetCommand({ TableName: table, Key: linkKey(chatId) }));
      const item = res.Item as LinkItem | undefined;
      const deletes = [doc.send(new DeleteCommand({ TableName: table, Key: linkKey(chatId) }))];
      if (item) {
        deletes.push(
          doc.send(
            new DeleteCommand({
              TableName: table,
              Key: { pk: roleIndexPk(item.groupId, item.role), sk: `LINK#${chatId}` },
            }),
          ),
        );
      }
      await Promise.all(deletes);
    },

    async linksForRole(groupId: string, role: string): Promise<readonly Link[]> {
      const res = await doc.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': roleIndexPk(groupId, role) },
        }),
      );
      const indexItems = (res.Items ?? []) as RoleIndexItem[];
      const links = await Promise.all(
        indexItems.map(async (indexItem) => {
          const linkRes = await doc.send(
            new GetCommand({ TableName: table, Key: linkKey(indexItem.chatId) }),
          );
          const item = linkRes.Item as LinkItem | undefined;
          return item
            ? {
                chatId: indexItem.chatId,
                groupId: item.groupId,
                role: item.role,
                linkedAt: item.linkedAt,
              }
            : null;
        }),
      );
      return links.filter((link): link is Link => link !== null);
    },

    async recordAck(ack: AckRecord): Promise<boolean> {
      try {
        await doc.send(
          new PutCommand({
            TableName: table,
            Item: { ...sentKey(ack.alertId, ack.chatId, ack.action), at: ack.at },
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        );
        return true;
      } catch (error) {
        if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
          return false;
        }
        throw error;
      }
    },

    async claimSend(alertId: string, chatId: string, step: string): Promise<boolean> {
      try {
        await doc.send(
          new PutCommand({
            TableName: table,
            Item: sendClaimKey(alertId, chatId, step),
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        );
        return true;
      } catch (error) {
        if (error instanceof Error && error.name === 'ConditionalCheckFailedException')
          return false;
        throw error;
      }
    },
  };
}
