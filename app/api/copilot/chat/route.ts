import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { buildCopilotPrincipal, getAuthorizedSubmission } from "@/lib/copilot/access";
import { buildProjectContextPack, buildConversationTitle } from "@/lib/copilot/context";
import {
  generateCompletion,
  getCopilotProviderKind,
  streamCompletion,
  type LlmChatMessage
} from "@/lib/copilot/provider";
import { buildContextMessage, buildModePrompt, buildSystemPrompt } from "@/lib/copilot/prompts";
import { sanitizeContext, sanitizePlainText, hasPromptInjectionSignal } from "@/lib/copilot/security";
import {
  createArtifacts,
  createAuditLog,
  createConversation,
  createMessage,
  ensureProjectRecord,
  getConversationForUser,
  listRecentMessagesForModel,
  updateConversation
} from "@/lib/copilot/store";
import { parseStructuredOutput } from "@/lib/copilot/structured";
import {
  COPILOT_MODES,
  type CopilotChatRequest,
  type CopilotJsonEnvelope,
  type CopilotStorageArtifactType
} from "@/lib/copilot/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const chatSchema = z.object({
  conversationId: z.string().trim().max(191).optional(),
  projectId: z.string().trim().max(64).optional(),
  mode: z.enum(COPILOT_MODES),
  message: z.string().trim().min(1).max(6000),
  context: z.record(z.string(), z.unknown()).optional(),
  stream: z.boolean().optional()
});

const encoder = new TextEncoder();

const asSseEvent = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

const buildMessagesForModel = async (input: {
  conversationId: string;
  mode: CopilotChatRequest["mode"];
  userMessage: string;
  contextText: string;
}) => {
  const history = await listRecentMessagesForModel(input.conversationId, 16);
  const messages: LlmChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(input.mode)
    },
    {
      role: "system",
      content: buildModePrompt(input.mode)
    }
  ];

  const contextMessage = buildContextMessage(input.contextText);
  if (contextMessage) {
    messages.push({
      role: "system",
      content: contextMessage
    });
  }

  for (const item of history) {
    if (item.role === "user" || item.role === "assistant") {
      messages.push(item);
    }
  }

  messages.push({ role: "user", content: input.userMessage });
  return messages;
};

const attachSourceMessageToArtifacts = (
  artifacts: Array<{ type: CopilotStorageArtifactType; payload: unknown }>,
  sourceMessageId: string,
  citations: CopilotJsonEnvelope["citations"]
) =>
  artifacts.map((artifact) => ({
    type: artifact.type,
    payload: {
      sourceMessageId,
      mode: artifact.type,
      data: artifact.payload,
      citations: citations ?? []
    }
  }));

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json();
  const parsed = chatSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  const principalFromSession = await buildCopilotPrincipal(session);
  let userId = principalFromSession.id;
  let conversation = null;

  if (body.conversationId) {
    conversation = await getConversationForUser(body.conversationId, userId);
    if (!conversation) {
      return NextResponse.json({ message: "Conversation not found" }, { status: 404 });
    }
  }

  const effectiveProjectId = body.projectId ?? conversation?.projectId ?? undefined;
  const projectAccess = await getAuthorizedSubmission(session, effectiveProjectId);
  if (!projectAccess.ok) {
    return NextResponse.json({ message: projectAccess.message }, { status: projectAccess.status });
  }
  const { principal, permissions } = projectAccess;
  userId = principal.id;

  if (projectAccess.submission) {
    await ensureProjectRecord(projectAccess.submission);
  }

  if (body.mode !== "GENERAL" && !permissions.canGenerateArtifacts) {
    const message = permissions.canGenerateApprovalCommentary
      ? "You are currently in approver-only mode for this project."
      : "Your role can view this project but cannot generate editable artifacts for it.";
    return NextResponse.json({ message }, { status: 403 });
  }

  if (!conversation) {
    conversation = await createConversation({
      userId,
      projectId: projectAccess.submission?.id,
      title: buildConversationTitle(body.message)
    });
  } else {
    if (
      body.projectId &&
      conversation.projectId &&
      conversation.projectId !== body.projectId
    ) {
      return NextResponse.json(
        { message: "Project mismatch for existing conversation" },
        { status: 400 }
      );
    }

    if (!conversation.projectId && projectAccess.submission) {
      conversation = await updateConversation(conversation.id, {
        projectId: projectAccess.submission.id
      });
    }
  }

  const userMessage = sanitizePlainText(body.message, 6000);
  const userContext = sanitizeContext(body.context, 5000);

  const userMessageRecord = await createMessage({
    conversationId: conversation.id,
    role: "user",
    content: userMessage
  });

  const contextPack = await buildProjectContextPack(projectAccess.submission?.id);
  const citations = contextPack.citations;

  const contextParts = [contextPack.contextText, userContext].filter(Boolean);
  const contextText = contextParts.join("\n\n");

  const modelMessages = await buildMessagesForModel({
    conversationId: conversation.id,
    mode: body.mode,
    userMessage,
    contextText
  });

  const suspicious = hasPromptInjectionSignal(userMessage);
  if (suspicious) {
    await createAuditLog({
      userId,
      projectId: projectAccess.submission?.id,
      conversationId: conversation.id,
      action: "COPILOT_PROMPT_INJECTION_SIGNAL",
      metadata: {
        mode: body.mode,
        messagePreview: userMessage.slice(0, 180)
      }
    });
  }

  const shouldStream = body.stream !== false;

  if (!shouldStream) {
    try {
      const assistantRaw = await generateCompletion(modelMessages);
      const parsedOutput = parseStructuredOutput(body.mode, assistantRaw);

      const jsonEnvelope: CopilotJsonEnvelope | null =
        parsedOutput.jsonData || citations.length > 0
          ? {
              mode: body.mode,
              data: parsedOutput.jsonData ?? undefined,
              citations
            }
          : null;

      const assistantMessage = await createMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: parsedOutput.cleanText || assistantRaw,
        json: jsonEnvelope
      });

      const savedArtifacts = await createArtifacts({
        conversationId: conversation.id,
        projectId: projectAccess.submission?.id,
        artifacts: attachSourceMessageToArtifacts(parsedOutput.artifacts, assistantMessage.id, citations)
      });

      await createAuditLog({
        userId,
        projectId: projectAccess.submission?.id,
        conversationId: conversation.id,
        action: "COPILOT_CHAT_COMPLETED",
        metadata: {
          mode: body.mode,
          stream: false,
          provider: getCopilotProviderKind(),
          userMessageId: userMessageRecord.id,
          assistantMessageId: assistantMessage.id,
          artifactCount: savedArtifacts.length
        }
      });

      return NextResponse.json({
        data: {
          conversationId: conversation.id,
          userMessage: userMessageRecord,
          assistantMessage,
          artifacts: savedArtifacts,
          citations,
          provider: getCopilotProviderKind()
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Copilot response failed";

      await createAuditLog({
        userId,
        projectId: projectAccess.submission?.id,
        conversationId: conversation.id,
        action: "COPILOT_CHAT_FAILED",
        metadata: {
          mode: body.mode,
          stream: false,
          error: message
        }
      });

      return NextResponse.json({ message }, { status: 500 });
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const run = async () => {
        controller.enqueue(
          asSseEvent({
            type: "conversation",
            conversationId: conversation.id,
            provider: getCopilotProviderKind(),
            userMessage: userMessageRecord
          })
        );

        let assistantRaw = "";

        try {
          for await (const token of streamCompletion(modelMessages)) {
            assistantRaw += token;
            controller.enqueue(asSseEvent({ type: "token", token }));
          }

          const parsedOutput = parseStructuredOutput(body.mode, assistantRaw);
          const jsonEnvelope: CopilotJsonEnvelope | null =
            parsedOutput.jsonData || citations.length > 0
              ? {
                  mode: body.mode,
                  data: parsedOutput.jsonData ?? undefined,
                  citations
                }
              : null;

          const assistantMessage = await createMessage({
            conversationId: conversation.id,
            role: "assistant",
            content: parsedOutput.cleanText || assistantRaw,
            json: jsonEnvelope
          });

          const savedArtifacts = await createArtifacts({
            conversationId: conversation.id,
            projectId: projectAccess.submission?.id,
            artifacts: attachSourceMessageToArtifacts(parsedOutput.artifacts, assistantMessage.id, citations)
          });

          await createAuditLog({
            userId,
            projectId: projectAccess.submission?.id,
            conversationId: conversation.id,
            action: "COPILOT_CHAT_COMPLETED",
            metadata: {
              mode: body.mode,
              stream: true,
              provider: getCopilotProviderKind(),
              userMessageId: userMessageRecord.id,
              assistantMessageId: assistantMessage.id,
              artifactCount: savedArtifacts.length
            }
          });

          controller.enqueue(
            asSseEvent({
              type: "done",
              conversationId: conversation.id,
              assistantMessage,
              artifacts: savedArtifacts,
              citations,
              provider: getCopilotProviderKind()
            })
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Copilot stream failed";

          await createAuditLog({
            userId,
            projectId: projectAccess.submission?.id,
            conversationId: conversation.id,
            action: "COPILOT_CHAT_FAILED",
            metadata: {
              mode: body.mode,
              stream: true,
              error: message
            }
          });

          controller.enqueue(asSseEvent({ type: "error", message }));
        } finally {
          controller.close();
        }
      };

      void run();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
