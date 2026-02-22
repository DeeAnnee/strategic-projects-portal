import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import type {
  CopilotArtifactResponse,
  CopilotChatMessageResponse,
  CopilotConversationSummary,
  CopilotJsonEnvelope,
  CopilotStorageArtifactType
} from "@/lib/copilot/types";
import type { ProjectSubmission } from "@/lib/submissions/types";
import { getDataStorePath, shouldUseMemoryStoreCache } from "@/lib/storage/data-store-path";
import { cloneJson, isReadonlyFsError, safePersistJson, safeReadJsonText } from "@/lib/storage/json-file";

export type CopilotConversationRecord = {
  id: string;
  userId: string;
  projectId: string | null;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CopilotMessageWithConversation = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  json: unknown | null;
  createdAt: Date;
  conversation: CopilotConversationRecord;
};

export type CopilotFeedbackRecord = {
  id: string;
  messageId: string;
  rating: number;
  tags: unknown | null;
  comment: string | null;
  createdAt: Date;
};

type FileProject = {
  id: string;
  name: string;
  summary: string | null;
  status: string | null;
  stage: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  startDate: string | null;
  endDate: string | null;
  targetGoLive: string | null;
  createdAt: string;
  updatedAt: string;
};

type FileConversation = {
  id: string;
  userId: string;
  projectId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

type FileMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  json: CopilotJsonEnvelope | null;
  createdAt: string;
};

type FileArtifact = {
  id: string;
  conversationId: string;
  projectId: string | null;
  type: CopilotStorageArtifactType;
  payload: unknown;
  createdAt: string;
};

type FileFeedback = {
  id: string;
  messageId: string;
  rating: number;
  tags: unknown | null;
  comment: string | null;
  createdAt: string;
};

type FileAuditLog = {
  id: string;
  userId: string;
  projectId: string | null;
  conversationId: string | null;
  action: string;
  metadata: unknown;
  createdAt: string;
};

type CopilotFileStore = {
  projects: FileProject[];
  conversations: FileConversation[];
  messages: FileMessage[];
  artifacts: FileArtifact[];
  feedback: FileFeedback[];
  auditLogs: FileAuditLog[];
};

const storeFile = getDataStorePath("copilot-store.json");
const storeDir = dirname(storeFile);

const emptyStore = (): CopilotFileStore => ({
  projects: [],
  conversations: [],
  messages: [],
  artifacts: [],
  feedback: [],
  auditLogs: []
});

let writeChain: Promise<void> = Promise.resolve();
let inMemoryCopilotStore: CopilotFileStore | null = null;

const nowIso = () => new Date().toISOString();
const asDate = (value: string) => new Date(value);
const asNullableDate = (value?: string) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const toConversationRecord = (row: FileConversation): CopilotConversationRecord => ({
  id: row.id,
  userId: row.userId,
  projectId: row.projectId,
  title: row.title,
  createdAt: asDate(row.createdAt),
  updatedAt: asDate(row.updatedAt)
});

const toMessageResponse = (row: FileMessage): CopilotChatMessageResponse => ({
  id: row.id,
  conversationId: row.conversationId,
  role: row.role,
  content: row.content,
  json: row.json,
  createdAt: row.createdAt
});

const toArtifactResponse = (row: FileArtifact): CopilotArtifactResponse => ({
  id: row.id,
  conversationId: row.conversationId,
  projectId: row.projectId,
  type: row.type,
  payload: row.payload,
  createdAt: row.createdAt
});

const waitForWrites = async () => {
  try {
    await writeChain;
  } catch {
    // Keep store available even if a prior write failed.
  }
};

const ensureStoreDir = async () => {
  try {
    await fs.mkdir(storeDir, { recursive: true });
  } catch (error) {
    if (!isReadonlyFsError(error)) {
      throw error;
    }
  }
};

const readStore = async (): Promise<CopilotFileStore> => {
  if (shouldUseMemoryStoreCache() && inMemoryCopilotStore) {
    return cloneJson(inMemoryCopilotStore);
  }
  await waitForWrites();
  await ensureStoreDir();
  try {
    const raw = await safeReadJsonText(storeFile);
    const parsed = JSON.parse(raw) as Partial<CopilotFileStore>;
    const normalized = {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : []
    };
    inMemoryCopilotStore = shouldUseMemoryStoreCache() ? cloneJson(normalized) : null;
    return normalized;
  } catch {
    const initial = emptyStore();
    inMemoryCopilotStore = shouldUseMemoryStoreCache() ? cloneJson(initial) : null;
    return initial;
  }
};

const persistStore = async (store: CopilotFileStore) => {
  inMemoryCopilotStore = shouldUseMemoryStoreCache() ? cloneJson(store) : null;
  await ensureStoreDir();
  await safePersistJson(storeFile, store);
};

const mutateStore = async <T>(mutator: (store: CopilotFileStore) => Promise<T> | T): Promise<T> => {
  const run = async () => {
    const store = await readStore();
    const result = await mutator(store);
    await persistStore(store);
    return result;
  };

  const current = writeChain.then(run, run);
  writeChain = current.then(
    () => undefined,
    () => undefined
  );
  return current;
};

const touchConversation = (store: CopilotFileStore, conversationId: string) => {
  const item = store.conversations.find((conversation) => conversation.id === conversationId);
  if (!item) {
    return;
  }
  item.updatedAt = nowIso();
};

export const ensureProjectRecordFile = async (submission: ProjectSubmission) =>
  mutateStore(async (store) => {
    const current = store.projects.find((project) => project.id === submission.id);
    const now = nowIso();
    const next: FileProject = {
      id: submission.id,
      name: submission.title || submission.id,
      summary: submission.summary ?? null,
      status: submission.status ?? null,
      stage: submission.stage ?? null,
      ownerName: submission.ownerName ?? null,
      ownerEmail: submission.ownerEmail ?? null,
      startDate: asNullableDate(submission.startDate),
      endDate: asNullableDate(submission.endDate),
      targetGoLive: asNullableDate(submission.targetGoLive),
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    };

    if (current) {
      Object.assign(current, next);
      return current;
    }

    store.projects.push(next);
    return next;
  });

export const createConversationFile = async (input: {
  userId: string;
  projectId?: string;
  title?: string;
}): Promise<CopilotConversationRecord> =>
  mutateStore(async (store) => {
    const now = nowIso();
    const row: FileConversation = {
      id: randomUUID(),
      userId: input.userId,
      projectId: input.projectId ?? null,
      title: input.title?.trim() || null,
      createdAt: now,
      updatedAt: now
    };
    store.conversations.push(row);
    return toConversationRecord(row);
  });

export const getConversationForUserFile = async (
  conversationId: string,
  userId: string
): Promise<CopilotConversationRecord | null> => {
  const store = await readStore();
  const row = store.conversations.find(
    (conversation) => conversation.id === conversationId && conversation.userId === userId
  );
  return row ? toConversationRecord(row) : null;
};

export const updateConversationFile = async (
  conversationId: string,
  data: {
    projectId?: string | null;
    title?: string | null;
  }
): Promise<CopilotConversationRecord> =>
  mutateStore(async (store) => {
    const row = store.conversations.find((conversation) => conversation.id === conversationId);
    if (!row) {
      throw new Error("Conversation not found");
    }

    if ("projectId" in data) {
      row.projectId = data.projectId ?? null;
    }
    if ("title" in data) {
      row.title = data.title ?? null;
    }
    row.updatedAt = nowIso();
    return toConversationRecord(row);
  });

export const listConversationsForUserFile = async (
  userId: string,
  projectId?: string
): Promise<CopilotConversationSummary[]> => {
  const store = await readStore();
  const rows = store.conversations
    .filter(
      (conversation) =>
        conversation.userId === userId && (!projectId || conversation.projectId === projectId)
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return rows.map((row) => {
    const messageRows = store.messages.filter((message) => message.conversationId === row.id);
    const artifactRows = store.artifacts.filter((artifact) => artifact.conversationId === row.id);
    const latestMessage = [...messageRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];

    return {
      id: row.id,
      title: row.title,
      projectId: row.projectId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      messageCount: messageRows.length,
      artifactCount: artifactRows.length,
      lastMessagePreview: latestMessage?.content?.slice(0, 160) ?? null
    };
  });
};

export const listConversationMessagesForUserFile = async (
  conversationId: string,
  userId: string
): Promise<CopilotChatMessageResponse[]> => {
  const store = await readStore();
  const conversation = store.conversations.find(
    (item) => item.id === conversationId && item.userId === userId
  );
  if (!conversation) {
    return [];
  }

  return store.messages
    .filter((message) => message.conversationId === conversationId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(toMessageResponse);
};

export const listRecentMessagesForModelFile = async (
  conversationId: string,
  take = 16
): Promise<Array<{ role: "user" | "assistant" | "system"; content: string }>> => {
  const store = await readStore();
  return store.messages
    .filter((message) => message.conversationId === conversationId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, take)
    .reverse()
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
};

export const createMessageFile = async (input: {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  json?: CopilotJsonEnvelope | null;
}): Promise<CopilotChatMessageResponse> =>
  mutateStore(async (store) => {
    const conversation = store.conversations.find(
      (item) => item.id === input.conversationId
    );
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const row: FileMessage = {
      id: randomUUID(),
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      json: input.json ?? null,
      createdAt: nowIso()
    };
    store.messages.push(row);
    touchConversation(store, input.conversationId);
    return toMessageResponse(row);
  });

export const createArtifactsFile = async (input: {
  conversationId: string;
  projectId?: string | null;
  artifacts: Array<{ type: CopilotStorageArtifactType; payload: unknown }>;
}): Promise<CopilotArtifactResponse[]> =>
  mutateStore(async (store) => {
    if (input.artifacts.length === 0) {
      return [];
    }

    const conversation = store.conversations.find(
      (item) => item.id === input.conversationId
    );
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const created = input.artifacts.map((artifact) => {
      const row: FileArtifact = {
        id: randomUUID(),
        conversationId: input.conversationId,
        projectId: input.projectId ?? null,
        type: artifact.type,
        payload: artifact.payload,
        createdAt: nowIso()
      };
      store.artifacts.push(row);
      return toArtifactResponse(row);
    });

    touchConversation(store, input.conversationId);
    return created;
  });

export const listArtifactsForConversationFile = async (
  conversationId: string,
  userId: string
): Promise<CopilotArtifactResponse[]> => {
  const store = await readStore();
  const conversation = store.conversations.find(
    (item) => item.id === conversationId && item.userId === userId
  );
  if (!conversation) {
    return [];
  }

  return store.artifacts
    .filter((artifact) => artifact.conversationId === conversationId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(toArtifactResponse);
};

export const createFeedbackFile = async (input: {
  messageId: string;
  rating: number;
  tags?: string[];
  comment?: string;
}): Promise<CopilotFeedbackRecord> =>
  mutateStore(async (store) => {
    const row: FileFeedback = {
      id: randomUUID(),
      messageId: input.messageId,
      rating: input.rating,
      tags: input.tags ?? null,
      comment: input.comment?.trim() || null,
      createdAt: nowIso()
    };
    store.feedback.push(row);
    return {
      id: row.id,
      messageId: row.messageId,
      rating: row.rating,
      tags: row.tags,
      comment: row.comment,
      createdAt: asDate(row.createdAt)
    };
  });

export const getMessageForUserFile = async (
  messageId: string,
  userId: string
): Promise<CopilotMessageWithConversation | null> => {
  const store = await readStore();
  const row = store.messages.find((message) => message.id === messageId);
  if (!row) {
    return null;
  }

  const conversation = store.conversations.find(
    (item) => item.id === row.conversationId && item.userId === userId
  );
  if (!conversation) {
    return null;
  }

  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    json: row.json,
    createdAt: asDate(row.createdAt),
    conversation: toConversationRecord(conversation)
  };
};

export const createAuditLogFile = async (input: {
  userId: string;
  action: string;
  projectId?: string | null;
  conversationId?: string | null;
  metadata?: unknown;
}) =>
  mutateStore(async (store) => {
    const row: FileAuditLog = {
      id: randomUUID(),
      userId: input.userId,
      projectId: input.projectId ?? null,
      conversationId: input.conversationId ?? null,
      action: input.action,
      metadata: input.metadata ?? null,
      createdAt: nowIso()
    };
    store.auditLogs.push(row);
    return row;
  });
