import { promises as fs } from "node:fs";

import { getDataStorePath } from "@/lib/storage/data-store-path";
import { cloneJson, safePersistJson } from "@/lib/storage/json-file";

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
  if (inMemoryOutbox) {
    return cloneJson(inMemoryOutbox);
  }
  try {
    const raw = await fs.readFile(storeFile, "utf8");
    const parsed = JSON.parse(raw) as OutboundMessage[];
    const rows = Array.isArray(parsed) ? parsed : [];
    inMemoryOutbox = cloneJson(rows);
    return rows;
  } catch {
    inMemoryOutbox = [];
    return [];
  }
};

const writeStore = async (rows: OutboundMessage[]) => {
  inMemoryOutbox = cloneJson(rows);
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
  return item;
};
