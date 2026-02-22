import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  CopilotArtifactResponse,
  CopilotChatMessageResponse,
  CopilotConversationSummary,
  CopilotJsonEnvelope,
  CopilotStorageArtifactType
} from "@/lib/copilot/types";
import type {
  CopilotConversationRecord,
  CopilotFeedbackRecord,
  CopilotMessageWithConversation
} from "@/lib/copilot/file-store";
import {
  createArtifactsFile,
  createAuditLogFile,
  createConversationFile,
  createFeedbackFile,
  createMessageFile,
  ensureProjectRecordFile,
  getConversationForUserFile,
  getMessageForUserFile,
  listArtifactsForConversationFile,
  listConversationMessagesForUserFile,
  listConversationsForUserFile,
  listRecentMessagesForModelFile,
  updateConversationFile
} from "@/lib/copilot/file-store";
import type { ProjectSubmission } from "@/lib/submissions/types";

const toDate = (value?: string) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toPrismaJson = (
  value: unknown,
  fallback: Prisma.InputJsonValue = {}
): Prisma.InputJsonValue => {
  if (value === undefined || value === null) {
    return fallback;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return fallback;
  }
};

let useFileStore = process.env.COPILOT_FORCE_FILE_STORE === "true";

const asErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const isDbUnavailableError = (error: unknown): boolean => {
  const message = asErrorMessage(error);
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";

  return (
    /P1000|P1001|P1002|P1003|P1008|P1010|P1011|P1017/.test(code) ||
    /P1000|P1001|P1002|P1003|P1008|P1010|P1011|P1017|schema engine error|can't reach database|denied access|relation .* does not exist|database.*does not exist|connection/i.test(
      message
    )
  );
};

const withFallback = async <T>(prismaRun: () => Promise<T>, fileRun: () => Promise<T>): Promise<T> => {
  if (useFileStore) {
    return fileRun();
  }

  try {
    return await prismaRun();
  } catch (error) {
    if (!isDbUnavailableError(error)) {
      throw error;
    }

    useFileStore = true;
    return fileRun();
  }
};

const toConversationRecord = (row: {
  id: string;
  userId: string;
  projectId: string | null;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CopilotConversationRecord => ({
  id: row.id,
  userId: row.userId,
  projectId: row.projectId,
  title: row.title,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const toChatMessage = (row: {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  json: unknown | null;
  createdAt: Date;
}): CopilotChatMessageResponse => ({
  id: row.id,
  conversationId: row.conversationId,
  role: row.role,
  content: row.content,
  json: (row.json as CopilotJsonEnvelope | null) ?? null,
  createdAt: row.createdAt.toISOString()
});

const toArtifact = (row: {
  id: string;
  conversationId: string;
  projectId: string | null;
  type: CopilotStorageArtifactType;
  payload: unknown;
  createdAt: Date;
}): CopilotArtifactResponse => ({
  id: row.id,
  conversationId: row.conversationId,
  projectId: row.projectId,
  type: row.type,
  payload: row.payload,
  createdAt: row.createdAt.toISOString()
});

export const ensureProjectRecord = async (submission: ProjectSubmission): Promise<void> =>
  withFallback(
    () =>
      prisma.project.upsert({
        where: { id: submission.id },
        create: {
          id: submission.id,
          name: submission.title || submission.id,
          title: submission.title || submission.id,
          summary: submission.summary,
          status: submission.status,
          stage: submission.stage,
          ownerName: submission.ownerName,
          ownerEmail: submission.ownerEmail,
          startDate: toDate(submission.startDate),
          endDate: toDate(submission.endDate),
          targetGoLive: toDate(submission.targetGoLive)
        },
        update: {
          name: submission.title || submission.id,
          title: submission.title || submission.id,
          summary: submission.summary,
          status: submission.status,
          stage: submission.stage,
          ownerName: submission.ownerName,
          ownerEmail: submission.ownerEmail,
          startDate: toDate(submission.startDate),
          endDate: toDate(submission.endDate),
          targetGoLive: toDate(submission.targetGoLive)
        }
      }).then(() => undefined),
    () => ensureProjectRecordFile(submission).then(() => undefined)
  );

export const createConversation = async (input: {
  userId: string;
  projectId?: string;
  title?: string;
}): Promise<CopilotConversationRecord> =>
  withFallback(
    async () =>
      toConversationRecord(
        await prisma.copilotConversation.create({
          data: {
            userId: input.userId,
            projectId: input.projectId,
            title: input.title?.trim() || null
          }
        })
      ),
    () => createConversationFile(input)
  );

export const getConversationForUser = async (
  conversationId: string,
  userId: string
): Promise<CopilotConversationRecord | null> =>
  withFallback(
    async () => {
      const row = await prisma.copilotConversation.findFirst({
        where: {
          id: conversationId,
          userId
        }
      });
      return row ? toConversationRecord(row) : null;
    },
    () => getConversationForUserFile(conversationId, userId)
  );

export const updateConversation = async (
  conversationId: string,
  data: {
    projectId?: string | null;
    title?: string | null;
  }
): Promise<CopilotConversationRecord> =>
  withFallback(
    async () =>
      toConversationRecord(
        await prisma.copilotConversation.update({
          where: { id: conversationId },
          data
        })
      ),
    () => updateConversationFile(conversationId, data)
  );

export const listConversationsForUser = async (
  userId: string,
  projectId?: string
): Promise<CopilotConversationSummary[]> =>
  withFallback(
    async () => {
      const rows = await prisma.copilotConversation.findMany({
        where: {
          userId,
          ...(projectId ? { projectId } : {})
        },
        orderBy: { updatedAt: "desc" },
        include: {
          _count: {
            select: {
              messages: true,
              artifacts: true
            }
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true }
          }
        }
      });

      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        projectId: row.projectId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        messageCount: row._count.messages,
        artifactCount: row._count.artifacts,
        lastMessagePreview: row.messages[0]?.content.slice(0, 160) ?? null
      }));
    },
    () => listConversationsForUserFile(userId, projectId)
  );

export const listConversationMessagesForUser = async (
  conversationId: string,
  userId: string
): Promise<CopilotChatMessageResponse[]> =>
  withFallback(
    async () => {
      const conversation = await prisma.copilotConversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true }
      });
      if (!conversation) {
        return [];
      }

      const rows = await prisma.copilotMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" }
      });

      return rows.map((row) =>
        toChatMessage({
          ...row,
          role: row.role as "user" | "assistant" | "system"
        })
      );
    },
    () => listConversationMessagesForUserFile(conversationId, userId)
  );

export const listRecentMessagesForModel = async (
  conversationId: string,
  take = 16
): Promise<Array<{ role: "user" | "assistant" | "system"; content: string }>> =>
  withFallback(
    async () => {
      const rows = await prisma.copilotMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          role: true,
          content: true
        }
      });

      return rows
        .reverse()
        .map((row) => ({
          role: row.role as "user" | "assistant" | "system",
          content: row.content
        }));
    },
    () => listRecentMessagesForModelFile(conversationId, take)
  );

export const createMessage = async (input: {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  json?: CopilotJsonEnvelope | null;
}): Promise<CopilotChatMessageResponse> =>
  withFallback(
    async () => {
      const jsonValue =
        input.json === undefined
          ? undefined
          : input.json === null
            ? Prisma.JsonNull
            : toPrismaJson(input.json);

      const row = await prisma.copilotMessage.create({
        data: {
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          ...(jsonValue !== undefined ? { json: jsonValue } : {})
        }
      });

      await prisma.copilotConversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: new Date() }
      });

      return toChatMessage({
        ...row,
        role: row.role as "user" | "assistant" | "system"
      });
    },
    () => createMessageFile(input)
  );

export const createArtifacts = async (input: {
  conversationId: string;
  projectId?: string | null;
  artifacts: Array<{ type: CopilotStorageArtifactType; payload: unknown }>;
}): Promise<CopilotArtifactResponse[]> =>
  withFallback(
    async () => {
      if (input.artifacts.length === 0) {
        return [];
      }

      const created = await Promise.all(
        input.artifacts.map((item) =>
          prisma.copilotArtifact.create({
            data: {
              conversationId: input.conversationId,
              projectId: input.projectId ?? null,
              type: item.type,
              payload: toPrismaJson(item.payload)
            }
          })
        )
      );

      await prisma.copilotConversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: new Date() }
      });

      return created.map((row) =>
        toArtifact({
          ...row,
          type: row.type as CopilotStorageArtifactType
        })
      );
    },
    () => createArtifactsFile(input)
  );

export const listArtifactsForConversation = async (
  conversationId: string,
  userId: string
): Promise<CopilotArtifactResponse[]> =>
  withFallback(
    async () => {
      const conversation = await prisma.copilotConversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true }
      });
      if (!conversation) {
        return [];
      }

      const rows = await prisma.copilotArtifact.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" }
      });

      return rows.map((row) =>
        toArtifact({
          ...row,
          type: row.type as CopilotStorageArtifactType
        })
      );
    },
    () => listArtifactsForConversationFile(conversationId, userId)
  );

export const createFeedback = async (input: {
  messageId: string;
  rating: number;
  tags?: string[];
  comment?: string;
}): Promise<CopilotFeedbackRecord> =>
  withFallback(
    async () =>
      await prisma.copilotFeedback.create({
        data: {
          messageId: input.messageId,
          rating: input.rating,
          ...(input.tags !== undefined ? { tags: toPrismaJson(input.tags, []) } : {}),
          comment: input.comment?.trim() || null
        }
      }),
    () => createFeedbackFile(input)
  );

export const getMessageForUser = async (
  messageId: string,
  userId: string
): Promise<CopilotMessageWithConversation | null> =>
  withFallback(
    async () => {
      const row = await prisma.copilotMessage.findFirst({
        where: {
          id: messageId,
          conversation: {
            userId
          }
        },
        include: {
          conversation: true
        }
      });
      if (!row) {
        return null;
      }

      return {
        id: row.id,
        conversationId: row.conversationId,
        role: row.role as "user" | "assistant" | "system",
        content: row.content,
        json: row.json as CopilotJsonEnvelope | null,
        createdAt: row.createdAt,
        conversation: toConversationRecord(row.conversation)
      };
    },
    () => getMessageForUserFile(messageId, userId)
  );

export const createAuditLog = async (input: {
  userId: string;
  action: string;
  projectId?: string | null;
  conversationId?: string | null;
  metadata?: unknown;
}): Promise<void> =>
  withFallback(
    () =>
      prisma.copilotAuditLog.create({
        data: {
          userId: input.userId,
          action: input.action,
          projectId: input.projectId ?? null,
          conversationId: input.conversationId ?? null,
          ...(input.metadata !== undefined
            ? {
                metadata:
                  input.metadata === null
                    ? Prisma.JsonNull
                    : toPrismaJson(input.metadata)
              }
            : {})
        }
      }).then(() => undefined),
    () => createAuditLogFile(input).then(() => undefined)
  );
