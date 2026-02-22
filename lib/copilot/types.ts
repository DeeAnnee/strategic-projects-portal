export const COPILOT_MODES = [
  "TASK_REWRITE",
  "SUBTASKS",
  "RISK_REGISTER",
  "KPI_SET",
  "EXEC_SUMMARY",
  "PROJECT_INSIGHTS",
  "GENERAL"
] as const;

export type CopilotMode = (typeof COPILOT_MODES)[number];

export const COPILOT_ARTIFACT_TYPES = [
  "TASK_REWRITE",
  "SUBTASKS",
  "RISK_REGISTER",
  "KPI_SET",
  "EXEC_SUMMARY",
  "PROJECT_INSIGHTS"
] as const;
export type CopilotArtifactType = (typeof COPILOT_ARTIFACT_TYPES)[number];

export const COPILOT_STORAGE_ARTIFACT_TYPES = ["TASKS", "RISKS", "KPIS", "EXEC_SUMMARY"] as const;
export type CopilotStorageArtifactType = (typeof COPILOT_STORAGE_ARTIFACT_TYPES)[number];
export type CopilotArtifactRecordType = CopilotArtifactType | CopilotStorageArtifactType;

export const mapCopilotArtifactTypeToStorage = (
  type: CopilotArtifactType
): CopilotStorageArtifactType => {
  if (type === "TASK_REWRITE" || type === "SUBTASKS") {
    return "TASKS";
  }
  if (type === "RISK_REGISTER") {
    return "RISKS";
  }
  if (type === "KPI_SET") {
    return "KPIS";
  }
  if (type === "PROJECT_INSIGHTS") {
    return "EXEC_SUMMARY";
  }
  return "EXEC_SUMMARY";
};

export const mapStorageTypeToDefaultArtifactType = (
  type: CopilotStorageArtifactType
): CopilotArtifactType => {
  if (type === "TASKS") return "TASK_REWRITE";
  if (type === "RISKS") return "RISK_REGISTER";
  if (type === "KPIS") return "KPI_SET";
  return "EXEC_SUMMARY";
};

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
  type: CopilotArtifactRecordType;
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
