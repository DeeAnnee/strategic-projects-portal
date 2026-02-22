type ProviderKind = "AZURE_OPENAI" | "OPENAI" | "NONE";

export type LlmChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CompletionOptions = {
  temperature?: number;
  maxTokens?: number;
};

type ProviderConfig =
  | {
      kind: "AZURE_OPENAI";
      endpoint: string;
      apiKey: string;
      deployment: string;
      apiVersion: string;
    }
  | {
      kind: "OPENAI";
      endpoint: string;
      apiKey: string;
      model: string;
    }
  | { kind: "NONE" };

const textDecoder = new TextDecoder();
const COMPLETION_TIMEOUT_MS = Number(process.env.COPILOT_COMPLETION_TIMEOUT_MS ?? 30000);
const STREAM_TIMEOUT_MS = Number(process.env.COPILOT_STREAM_TIMEOUT_MS ?? 55000);

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string
) => {
  const controller = new AbortController();
  const timeoutRef = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutRef);
  }
};

const getProviderConfig = (): ProviderConfig => {
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY?.trim();
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT?.trim();
  const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION?.trim() || "2024-10-21";

  if (azureEndpoint && azureApiKey && azureDeployment) {
    return {
      kind: "AZURE_OPENAI",
      endpoint: azureEndpoint.replace(/\/$/, ""),
      apiKey: azureApiKey,
      deployment: azureDeployment,
      apiVersion: azureApiVersion
    };
  }

  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  const openAiModel = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  if (openAiApiKey) {
    return {
      kind: "OPENAI",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: openAiApiKey,
      model: openAiModel
    };
  }

  return { kind: "NONE" };
};

const buildRequest = (
  config: Exclude<ProviderConfig, { kind: "NONE" }>,
  messages: LlmChatMessage[],
  stream: boolean,
  options?: CompletionOptions
): { url: string; init: RequestInit } => {
  const temperature = options?.temperature ?? 0.2;
  const max_tokens = options?.maxTokens ?? 1200;

  if (config.kind === "AZURE_OPENAI") {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "api-key": config.apiKey
    };

    return {
      url: `${config.endpoint}/openai/deployments/${config.deployment}/chat/completions?api-version=${config.apiVersion}`,
      init: {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages,
          temperature,
          max_tokens,
          stream
        })
      }
    };
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`
  };

  return {
    url: config.endpoint,
    init: {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        max_tokens,
        stream
      })
    }
  };
};

const readSseChunks = async function* (response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }

  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += textDecoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) {
        continue;
      }

      const payload = line.replace(/^data:\s*/, "");
      if (payload === "[DONE]") {
        return;
      }

      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{
            delta?: { content?: string };
            message?: { content?: string };
            text?: string;
          }>;
        };
        const token =
          parsed.choices?.[0]?.delta?.content ??
          parsed.choices?.[0]?.message?.content ??
          parsed.choices?.[0]?.text ??
          "";
        if (token) {
          yield token;
        }
      } catch {
        continue;
      }
    }
  }
};

const fallbackText = (messages: LlmChatMessage[]) => {
  const latestUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  return [
    "Project Copilot is running in local fallback mode (no Azure OpenAI/OpenAI credentials configured).",
    "",
    "You asked:",
    latestUser,
    "",
    "Suggestion:",
    "- Provide explicit project context (objective, constraints, timeline, owners).",
    "- Request a specific mode (TASK_BUILDER, RISKS, KPIS, EXEC_SUMMARY, or INSIGHTS).",
    "- Ask for JSON output to persist artifacts."
  ].join("\n");
};

const streamFallback = async function* (messages: LlmChatMessage[]): AsyncGenerator<string> {
  const text = fallbackText(messages);
  for (const token of text.split(/(\s+)/).filter(Boolean)) {
    yield token;
  }
};

export const getCopilotProviderKind = (): ProviderKind => getProviderConfig().kind;

export const generateCompletion = async (messages: LlmChatMessage[], options?: CompletionOptions): Promise<string> => {
  const config = getProviderConfig();

  if (config.kind === "NONE") {
    return fallbackText(messages);
  }

  const request = buildRequest(config, messages, false, options);
  const response = await fetchWithTimeout(request.url, request.init, COMPLETION_TIMEOUT_MS, "LLM completion");
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM completion failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
};

export const streamCompletion = async function* (
  messages: LlmChatMessage[],
  options?: CompletionOptions
): AsyncGenerator<string> {
  const config = getProviderConfig();

  if (config.kind === "NONE") {
    for await (const token of streamFallback(messages)) {
      yield token;
    }
    return;
  }

  const request = buildRequest(config, messages, true, options);
  const response = await fetchWithTimeout(request.url, request.init, STREAM_TIMEOUT_MS, "LLM stream");
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM stream failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  for await (const token of readSseChunks(response)) {
    yield token;
  }
};
