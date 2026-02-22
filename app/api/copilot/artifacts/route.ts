import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { buildCopilotPrincipal, getAuthorizedSubmission } from "@/lib/copilot/access";
import {
  createArtifacts,
  createAuditLog,
  getConversationForUser,
  getMessageForUser
} from "@/lib/copilot/store";
import {
  COPILOT_ARTIFACT_TYPES,
  COPILOT_STORAGE_ARTIFACT_TYPES,
  mapCopilotArtifactTypeToStorage,
  mapStorageTypeToDefaultArtifactType,
  type CopilotArtifactType,
  type CopilotStorageArtifactType
} from "@/lib/copilot/types";

export const runtime = "nodejs";

const artifactSchema = z.object({
  conversationId: z.string().trim().min(1).max(191),
  messageId: z.string().trim().min(1).max(191).optional(),
  projectId: z.string().trim().max(64).optional(),
  type: z
    .union([z.enum(COPILOT_ARTIFACT_TYPES), z.enum(COPILOT_STORAGE_ARTIFACT_TYPES)])
    .transform((value) => value as CopilotArtifactType | CopilotStorageArtifactType),
  payload: z.unknown()
});

const semanticArtifactTypeSet = new Set<string>(COPILOT_ARTIFACT_TYPES);
const storageArtifactTypeSet = new Set<string>(COPILOT_STORAGE_ARTIFACT_TYPES);

const toArtifactTypeInfo = (type: CopilotArtifactType | CopilotStorageArtifactType) => {
  if (semanticArtifactTypeSet.has(type)) {
    return {
      semanticType: type as CopilotArtifactType,
      storageType: mapCopilotArtifactTypeToStorage(type as CopilotArtifactType)
    };
  }

  if (storageArtifactTypeSet.has(type)) {
    return {
      semanticType: mapStorageTypeToDefaultArtifactType(type as CopilotStorageArtifactType),
      storageType: type as CopilotStorageArtifactType
    };
  }

  return {
    semanticType: "EXEC_SUMMARY" as CopilotArtifactType,
    storageType: "EXEC_SUMMARY" as CopilotStorageArtifactType
  };
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = artifactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const principalFromSession = await buildCopilotPrincipal(session);

  const conversation = await getConversationForUser(parsed.data.conversationId, principalFromSession.id);
  if (!conversation) {
    return NextResponse.json({ message: "Conversation not found" }, { status: 404 });
  }

  const requestedProjectId = parsed.data.projectId ?? conversation.projectId ?? undefined;
  const projectAccess = await getAuthorizedSubmission(session, requestedProjectId);
  if (!projectAccess.ok) {
    return NextResponse.json({ message: projectAccess.message }, { status: projectAccess.status });
  }
  const principal = projectAccess.principal;

  if (parsed.data.messageId) {
    const message = await getMessageForUser(parsed.data.messageId, principal.id);
    if (!message || message.conversationId !== conversation.id) {
      return NextResponse.json({ message: "Source message not found" }, { status: 404 });
    }
  }

  const payload =
    parsed.data.messageId &&
    parsed.data.payload &&
    typeof parsed.data.payload === "object" &&
    !Array.isArray(parsed.data.payload)
      ? {
          ...(parsed.data.payload as Record<string, unknown>),
          sourceMessageId: parsed.data.messageId
        }
      : parsed.data.payload;

  const typeInfo = toArtifactTypeInfo(parsed.data.type);
  const payloadWithType =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? {
          ...(payload as Record<string, unknown>),
          artifactType: typeInfo.semanticType
        }
      : {
          artifactType: typeInfo.semanticType,
          data: payload
        };

  const artifacts = await createArtifacts({
    conversationId: conversation.id,
    projectId: projectAccess.submission?.id ?? conversation.projectId,
    artifacts: [
      {
        type: typeInfo.storageType,
        payload: payloadWithType
      }
    ]
  });

  await createAuditLog({
    userId: principal.id,
    projectId: projectAccess.submission?.id ?? conversation.projectId,
    conversationId: conversation.id,
    action: "COPILOT_ARTIFACT_SAVED_MANUALLY",
    metadata: {
      type: parsed.data.type,
      messageId: parsed.data.messageId ?? null
    }
  });

  return NextResponse.json({ data: artifacts[0] }, { status: 201 });
}
