import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { createAuditLog, createFeedback, getMessageForUser } from "@/lib/copilot/store";

export const runtime = "nodejs";

const feedbackSchema = z.object({
  messageId: z.string().trim().min(1).max(191),
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().trim().min(1).max(60)).max(8).optional(),
  comment: z.string().trim().max(1500).optional()
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = feedbackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const message = await getMessageForUser(parsed.data.messageId, session.user.id);
  if (!message) {
    return NextResponse.json({ message: "Message not found" }, { status: 404 });
  }

  const feedback = await createFeedback({
    messageId: parsed.data.messageId,
    rating: parsed.data.rating,
    tags: parsed.data.tags,
    comment: parsed.data.comment
  });

  await createAuditLog({
    userId: session.user.id,
    projectId: message.conversation.projectId,
    conversationId: message.conversationId,
    action: "COPILOT_FEEDBACK_SAVED",
    metadata: {
      messageId: parsed.data.messageId,
      rating: parsed.data.rating,
      tags: parsed.data.tags ?? []
    }
  });

  return NextResponse.json({
    data: {
      id: feedback.id,
      messageId: feedback.messageId,
      rating: feedback.rating,
      tags: feedback.tags,
      comment: feedback.comment,
      createdAt: feedback.createdAt.toISOString()
    }
  });
}
