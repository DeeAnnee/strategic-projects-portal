import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";
import { getDataStorePath, shouldUseMemoryStoreCache } from "@/lib/storage/data-store-path";
import {
  cloneJson,
  isDataStorePersistenceError,
  isStoreMissingError,
  safePersistJson,
  safeReadJsonText
} from "@/lib/storage/json-file";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  recipientEmail?: string;
  isRead: boolean;
  createdAt: string;
};

const storeFile = getDataStorePath("notifications.json");
let inMemoryNotifications: NotificationItem[] | null = null;

const readStore = async (): Promise<NotificationItem[]> => {
  if (shouldUseMemoryStoreCache() && inMemoryNotifications) {
    return cloneJson(inMemoryNotifications);
  }
  try {
    const raw = await safeReadJsonText(storeFile);
    const parsed = JSON.parse(raw) as NotificationItem[];
    const rows = Array.isArray(parsed) ? parsed : [];
    inMemoryNotifications = shouldUseMemoryStoreCache() ? cloneJson(rows) : null;
    return rows;
  } catch (error) {
    if (isDataStorePersistenceError(error)) {
      throw error;
    }
    if (!isStoreMissingError(error)) {
      throw error;
    }
    inMemoryNotifications = shouldUseMemoryStoreCache() ? [] : null;
    return [];
  }
};

const writeStore = async (rows: NotificationItem[]) => {
  inMemoryNotifications = shouldUseMemoryStoreCache() ? cloneJson(rows) : null;
  await safePersistJson(storeFile, rows);
};

export const listNotifications = async (recipientEmail?: string) => {
  const rows = await readStore();
  const filtered = recipientEmail
    ? rows.filter((row) => !row.recipientEmail || row.recipientEmail.toLowerCase() === recipientEmail.toLowerCase())
    : rows;

  return filtered.sort((a, b) =>
    a.isRead === b.isRead ? (a.createdAt < b.createdAt ? 1 : -1) : a.isRead ? 1 : -1
  );
};

export const addNotification = async (
  input: Omit<NotificationItem, "id" | "isRead" | "createdAt">
) => {
  const rows = await readStore();
  const item: NotificationItem = {
    id: `n-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    title: input.title,
    body: input.body,
    href: input.href,
    recipientEmail: input.recipientEmail?.toLowerCase(),
    isRead: false,
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
      details: "Queued in-app notification.",
      metadata: {
        channel: "in_app",
        recipient: item.recipientEmail ?? "all",
        title: item.title
      }
    });
  } catch {
    // Non-blocking audit write.
  }
  return item;
};

export const markNotificationRead = async (id: string) => {
  const rows = await readStore();
  const index = rows.findIndex((r) => r.id === id);
  if (index === -1) return null;
  rows[index] = { ...rows[index], isRead: true };
  await writeStore(rows);
  return rows[index];
};

export const markAllNotificationsRead = async () => {
  const rows = await readStore();
  const next = rows.map((r) => ({ ...r, isRead: true }));
  await writeStore(next);
  return next;
};
