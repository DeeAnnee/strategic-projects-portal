import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { getAuthorizedSubmission } from "@/lib/copilot/access";
import {
  createArtifacts,
  createAuditLog,
  getConversationForUser,
  getMessageForUser
} from "@/lib/copilot/store";

export const runtime = "nodejs";

const artifactSchema = z.object({
  conversationId: z.string().trim().min(1).max(191),
  messageId: z.string().trim().min(1).max(191).optional(),
  projectId: z.string().trim().max(64).optional(),
  type: z.enum(["TASKS", "RISKS", "KPIS", "EXEC_SUMMARY"]),
  payload: z.unknown()
});

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

  const conversation = await getConversationForUser(parsed.data.conversationId, session.user.id);
  if (!conversation) {
    return NextResponse.json({ message: "Conversation not found" }, { status: 404 });
  }

  const requestedProjectId = parsed.data.projectId ?? conversation.projectId ?? undefined;
  const projectAccess = await getAuthorizedSubmission(session, requestedProjectId);
  if (!projectAccess.ok) {
    return NextResponse.json({ message: projectAccess.message }, { status: projectAccess.status });
  }

  if (parsed.data.messageId) {
    const message = await getMessageForUser(parsed.data.messageId, session.user.id);
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

  const artifacts = await createArtifacts({
    conversationId: conversation.id,
    projectId: projectAccess.submission?.id ?? conversation.projectId,
    artifacts: [
      {
        type: parsed.data.type,
        payload
      }
    ]
  });

  await createAuditLog({
    userId: session.user.id,
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
