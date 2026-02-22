import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";
import { getDataStorePath, shouldUseMemoryStoreCache } from "@/lib/storage/data-store-path";
import {
  cloneJson,
  isDataStorePersistenceError,
  isStoreMissingError,
  safePersistJson,
  safeReadJsonText
} from "@/lib/storage/json-file";

export type OutboundChannel = "email" | "teams";

export type OutboundMessage = {
  id: string;
  channel: OutboundChannel;
  to: string;
  subject: string;
  body: string;
  href?: string;
  attachmentHref?: string;
  createdAt: string;
};

const storeFile = getDataStorePath("message-outbox.json");
let inMemoryOutbox: OutboundMessage[] | null = null;

const readStore = async (): Promise<OutboundMessage[]> => {
  if (shouldUseMemoryStoreCache() && inMemoryOutbox) {
    return cloneJson(inMemoryOutbox);
  }
  try {
    const raw = await safeReadJsonText(storeFile);
    const parsed = JSON.parse(raw) as OutboundMessage[];
    const rows = Array.isArray(parsed) ? parsed : [];
    inMemoryOutbox = shouldUseMemoryStoreCache() ? cloneJson(rows) : null;
    return rows;
  } catch (error) {
    if (isDataStorePersistenceError(error)) {
      throw error;
    }
    if (!isStoreMissingError(error)) {
      throw error;
    }
    inMemoryOutbox = shouldUseMemoryStoreCache() ? [] : null;
    return [];
  }
};

const writeStore = async (rows: OutboundMessage[]) => {
  inMemoryOutbox = shouldUseMemoryStoreCache() ? cloneJson(rows) : null;
  await safePersistJson(storeFile, rows);
};

export const queueOutboundMessage = async (
  input: Omit<OutboundMessage, "id" | "createdAt">
): Promise<OutboundMessage> => {
  const rows = await readStore();
  const item: OutboundMessage = {
    id: `msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    channel: input.channel,
    to: input.to,
    subject: input.subject,
    body: input.body,
    href: input.href,
    attachmentHref: input.attachmentHref,
    createdAt: new Date().toISOString()
  };

  rows.push(item);
  await writeStore(rows);
  try {
    await appendGovernanceAuditLog({
      area: "WORKFLOW",
      action: "NOTIFICATION_QUEUED",
      entityType: "notification",
      entityId: item.id,
      outcome: "SUCCESS",
      actorName: "Notification Service",
      actorEmail: "system@portal.local",
      details: `Queued ${item.channel.toUpperCase()} notification.`,
      metadata: {
        channel: item.channel,
        recipient: item.to,
        subject: item.subject
      }
    });
  } catch {
    // Non-blocking audit write.
  }
  return item;
};
