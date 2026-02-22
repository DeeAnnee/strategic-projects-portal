import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { getAuthorizedSubmission } from "@/lib/copilot/access";
import {
  createAuditLog,
  getConversationForUser,
  listArtifactsForConversation,
  listConversationMessagesForUser,
  listConversationsForUser
} from "@/lib/copilot/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  conversationId: z.string().trim().max(191).optional(),
  projectId: z.string().trim().max(64).optional()
});

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }

    const { conversationId, projectId } = parsed.data;

    const projectAccess = await getAuthorizedSubmission(session, projectId);
    if (!projectAccess.ok) {
      return NextResponse.json({ message: projectAccess.message }, { status: projectAccess.status });
    }

    if (!conversationId) {
      const conversations = await listConversationsForUser(session.user.id, projectAccess.submission?.id);

      await createAuditLog({
        userId: session.user.id,
        projectId: projectAccess.submission?.id,
        action: "COPILOT_HISTORY_LISTED",
        metadata: {
          conversationCount: conversations.length,
          projectFilter: projectAccess.submission?.id ?? null
        }
      });

      return NextResponse.json({ data: { conversations } });
    }

    const conversation = await getConversationForUser(conversationId, session.user.id);
    if (!conversation) {
      return NextResponse.json({ message: "Conversation not found" }, { status: 404 });
    }

    if (conversation.projectId) {
      const conversationProjectAccess = await getAuthorizedSubmission(session, conversation.projectId);
      if (!conversationProjectAccess.ok) {
        return NextResponse.json({ message: conversationProjectAccess.message }, { status: conversationProjectAccess.status });
      }
    }

    const [messages, artifacts] = await Promise.all([
      listConversationMessagesForUser(conversation.id, session.user.id),
      listArtifactsForConversation(conversation.id, session.user.id)
    ]);

    await createAuditLog({
      userId: session.user.id,
      projectId: conversation.projectId,
      conversationId: conversation.id,
      action: "COPILOT_HISTORY_OPENED",
      metadata: {
        messageCount: messages.length,
        artifactCount: artifacts.length
      }
    });

    return NextResponse.json({
      data: {
        conversation: {
          id: conversation.id,
          title: conversation.title,
          projectId: conversation.projectId,
          createdAt: conversation.createdAt.toISOString(),
          updatedAt: conversation.updatedAt.toISOString()
        },
        messages,
        artifacts
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Copilot history failed";
    const friendlyMessage = /relation|does not exist|database|connect|schema engine/i.test(message)
      ? "Copilot data store is unavailable. Ensure PostgreSQL is running and run Prisma migrations."
      : "Copilot history request failed.";
    return NextResponse.json({ message: friendlyMessage, detail: message }, { status: 500 });
  }
}
