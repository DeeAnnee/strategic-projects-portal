import { promises as fs } from "node:fs";
import path from "node:path";

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

const storeFile = path.join(process.cwd(), "data", "message-outbox.json");

const readStore = async (): Promise<OutboundMessage[]> => {
  try {
    const raw = await fs.readFile(storeFile, "utf8");
    const parsed = JSON.parse(raw) as OutboundMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStore = async (rows: OutboundMessage[]) => {
  await fs.writeFile(storeFile, JSON.stringify(rows, null, 2), "utf8");
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
