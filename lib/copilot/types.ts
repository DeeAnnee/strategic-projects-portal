export const COPILOT_MODES = [
  "TASK_BUILDER",
  "RISKS",
  "KPIS",
  "EXEC_SUMMARY",
  "INSIGHTS",
  "GENERAL"
] as const;

export type CopilotMode = (typeof COPILOT_MODES)[number];

export const COPILOT_ARTIFACT_TYPES = ["TASKS", "RISKS", "KPIS", "EXEC_SUMMARY"] as const;
export type CopilotArtifactType = (typeof COPILOT_ARTIFACT_TYPES)[number];

export type CopilotTemplate = {
  id: string;
  label: string;
  mode: CopilotMode;
  prompt: string;
  description: string;
};

export type CopilotCitation = {
  source: string;
  label: string;
  detail?: string;
  fields?: string[];
};

export type CopilotJsonEnvelope = {
  mode: CopilotMode;
  data?: unknown;
  citations?: CopilotCitation[];
};

export type CopilotChatRequest = {
  conversationId?: string;
  projectId?: string;
  mode: CopilotMode;
  message: string;
  context?: Record<string, unknown>;
  stream?: boolean;
};

export type CopilotChatMessageResponse = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  json: CopilotJsonEnvelope | null;
  createdAt: string;
};

export type CopilotArtifactResponse = {
  id: string;
  conversationId: string;
  projectId: string | null;
  type: CopilotArtifactType;
  payload: unknown;
  createdAt: string;
};

export type CopilotConversationSummary = {
  id: string;
  title: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  artifactCount: number;
  lastMessagePreview: string | null;
};

export type CopilotSseConversationEvent = {
  type: "conversation";
  conversationId: string;
  provider: "AZURE_OPENAI" | "OPENAI" | "NONE";
  userMessage?: CopilotChatMessageResponse;
};

export type CopilotSseTokenEvent = {
  type: "token";
  token: string;
};

export type CopilotSseDoneEvent = {
  type: "done";
  conversationId: string;
  assistantMessage: CopilotChatMessageResponse;
  artifacts: CopilotArtifactResponse[];
  citations: CopilotCitation[];
  provider: "AZURE_OPENAI" | "OPENAI" | "NONE";
};

export type CopilotSseErrorEvent = {
  type: "error";
  message: string;
};

export type CopilotSseEvent =
  | CopilotSseConversationEvent
  | CopilotSseTokenEvent
  | CopilotSseDoneEvent
  | CopilotSseErrorEvent;
