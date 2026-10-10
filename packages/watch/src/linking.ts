import type { AlertAction } from '@vayu/contracts';

export interface LinkCode {
  readonly code: string;
  readonly groupId: string;
  readonly role: string;
  readonly expiresAt: string;
}

export interface Link {
  readonly chatId: string;
  readonly groupId: string;
  readonly role: string;
  readonly linkedAt: string;
}

export interface AckRecord {
  readonly alertId: string;
  readonly chatId: string;
  readonly action: AlertAction;
  readonly at: string;
}

/**
 * Everything the webhook needs to persist. One interface so the razor can run on an in-memory
 * fixture and the full version swaps in a real `Watch`-table-backed implementation without
 * touching `handleTelegramUpdate`.
 */
export interface LinkStore {
  saveLinkCode(linkCode: LinkCode): Promise<void>;
  getLinkCode(code: string): Promise<LinkCode | null>;
  consumeLinkCode(code: string): Promise<void>;
  saveLink(link: Link): Promise<void>;
  deleteLink(chatId: string): Promise<void>;
  linksForRole(groupId: string, role: string): Promise<readonly Link[]>;
  /** Records an ack. Returns false if this exact alert+chat+action was already recorded (I8). */
  recordAck(ack: AckRecord): Promise<boolean>;
  /**
   * Claims the right to send one step of an alert to one chat, once (rule I8). Returns false if
   * that alert+chat+step was already claimed, so a retried send can never message a person twice.
   */
  claimSend(alertId: string, chatId: string, step: string): Promise<boolean>;
}

/** Six random base-36 characters — one-time, short enough to type into Telegram by hand. */
export function generateLinkCode(random: () => number = Math.random): string {
  return Array.from({ length: 6 }, () => Math.floor(random() * 36).toString(36)).join('');
}

/** An in-memory `LinkStore` for tests and the razor. Not durable, not shared across invocations. */
export function fixtureLinkStore(): LinkStore {
  const codes = new Map<string, LinkCode>();
  const links = new Map<string, Link>();
  const acks = new Set<string>();
  const sends = new Set<string>();

  return {
    saveLinkCode(linkCode) {
      codes.set(linkCode.code, linkCode);
      return Promise.resolve();
    },
    getLinkCode(code) {
      return Promise.resolve(codes.get(code) ?? null);
    },
    consumeLinkCode(code) {
      codes.delete(code);
      return Promise.resolve();
    },
    saveLink(link) {
      links.set(link.chatId, link);
      return Promise.resolve();
    },
    deleteLink(chatId) {
      links.delete(chatId);
      return Promise.resolve();
    },
    linksForRole(groupId, role) {
      return Promise.resolve(
        Array.from(links.values()).filter((link) => link.groupId === groupId && link.role === role),
      );
    },
    recordAck(ack) {
      const key = `${ack.alertId}:${ack.chatId}:${ack.action}`;
      if (acks.has(key)) {
        return Promise.resolve(false);
      }
      acks.add(key);
      return Promise.resolve(true);
    },
    claimSend(alertId, chatId, step) {
      const key = `${alertId}:${chatId}:${step}`;
      if (sends.has(key)) return Promise.resolve(false);
      sends.add(key);
      return Promise.resolve(true);
    },
  };
}
