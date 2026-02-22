"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  COPILOT_MODES,
  COPILOT_ARTIFACT_TYPES,
  mapStorageTypeToDefaultArtifactType,
  type CopilotArtifactResponse,
  type CopilotArtifactType,
  type CopilotChatMessageResponse,
  type CopilotCitation,
  type CopilotConversationSummary,
  type CopilotJsonEnvelope,
  type CopilotMode,
  type CopilotStorageArtifactType,
  type CopilotTemplate
} from "@/lib/copilot/types";

type ProjectChoice = {
  id: string;
  title: string;
};

type CopilotPanelProps = {
  projectId?: string;
  projectTitle?: string;
  initialMode?: CopilotMode;
  className?: string;
  onInsert?: (payload: {
    text: string;
    json?: unknown;
    artifact?: CopilotArtifactResponse;
    conversationId?: string;
  }) => void;
};

const modeLabels: Record<CopilotMode, string> = {
  TASK_REWRITE: "Improve Task",
  SUBTASKS: "Subtasks",
  RISK_REGISTER: "Risks",
  KPI_SET: "KPIs",
  EXEC_SUMMARY: "Exec Summary",
  PROJECT_INSIGHTS: "Insights",
  GENERAL: "General"
};

const artifactTypeByMode: Partial<Record<CopilotMode, CopilotArtifactType>> = {
  TASK_REWRITE: "TASK_REWRITE",
  SUBTASKS: "SUBTASKS",
  RISK_REGISTER: "RISK_REGISTER",
  KPI_SET: "KPI_SET",
  EXEC_SUMMARY: "EXEC_SUMMARY",
  PROJECT_INSIGHTS: "PROJECT_INSIGHTS"
};

const defaultQuickActions: CopilotTemplate[] = [
  {
    id: "improve-task",
    label: "Improve my task",
    mode: "TASK_REWRITE",
    prompt:
      "Rewrite the provided task into a SMART, governance-ready task with measurable outcome, scope boundaries, acceptance criteria, and timeline.",
    description: "Converts rough work statements into SMART governance-ready tasks."
  },
  {
    id: "break-subtasks",
    label: "Break into subtasks",
    mode: "SUBTASKS",
    prompt:
      "Decompose this task into sequenced subtasks with dependencies, owners (if known), and effort estimates.",
    description: "Creates dependency-aware subtask decomposition."
  },
  {
    id: "generate-risks",
    label: "Generate risks",
    mode: "RISK_REGISTER",
    prompt:
      "Generate a project-specific risk register with mitigation, contingency, owner, and early warning indicators.",
    description: "Builds a risk register with likelihood, impact, and mitigation actions."
  },
  {
    id: "generate-kpis",
    label: "Generate KPIs",
    mode: "KPI_SET",
    prompt:
      "Generate leading and lagging KPIs with formulas, baseline, target, frequency, and data source.",
    description: "Suggests delivery and benefits KPIs suitable for governance reviews."
  },
  {
    id: "draft-exec-summary",
    label: "Draft exec summary",
    mode: "EXEC_SUMMARY",
    prompt:
      "Draft a steering-committee executive summary with objective, current status, key wins, issues, next steps, and asks.",
    description: "Creates board-ready summary language."
  },
  {
    id: "insights-project",
    label: "Insights from this project",
    mode: "PROJECT_INSIGHTS",
    prompt:
      "Generate strategic and delivery insights, blind spots, likely blockers, quick wins, and recommended next actions.",
    description: "Data-aware analysis from project metadata and governance signals."
  }
];

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

const parseApiError = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
};

const mergeArtifacts = (current: CopilotArtifactResponse[], next: CopilotArtifactResponse[]) => {
  const map = new Map<string, CopilotArtifactResponse>();
  for (const item of current) {
    map.set(item.id, item);
  }
  for (const item of next) {
    map.set(item.id, item);
  }

  return Array.from(map.values()).sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return bTime - aTime;
  });
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getEnvelope = (message: CopilotChatMessageResponse): CopilotJsonEnvelope | null => {
  if (!message.json || !isObject(message.json)) {
    return null;
  }

  return message.json as CopilotJsonEnvelope;
};

const getCitations = (envelope: CopilotJsonEnvelope | null): CopilotCitation[] => {
  if (!envelope || !Array.isArray(envelope.citations)) {
    return [];
  }

  return envelope.citations.filter((item): item is CopilotCitation => isObject(item) && typeof item.source === "string");
};

const normalizeArtifactData = (payload: unknown) => {
  if (!isObject(payload)) {
    return payload;
  }
  if ("data" in payload && (payload as { data?: unknown }).data !== undefined) {
    return (payload as { data?: unknown }).data;
  }
  return payload;
};

const semanticTypeSet = new Set<string>(COPILOT_ARTIFACT_TYPES);

const resolveArtifactType = (artifact: CopilotArtifactResponse): CopilotArtifactType => {
  const payload = artifact.payload;
  if (isObject(payload) && typeof payload.artifactType === "string" && semanticTypeSet.has(payload.artifactType)) {
    return payload.artifactType as CopilotArtifactType;
  }

  if (typeof artifact.type === "string" && semanticTypeSet.has(artifact.type)) {
    return artifact.type as CopilotArtifactType;
  }

  return mapStorageTypeToDefaultArtifactType(artifact.type as CopilotStorageArtifactType);
};

const getArtifactCitations = (payload: unknown): CopilotCitation[] => {
  if (!isObject(payload) || !Array.isArray(payload.citations)) {
    return [];
  }

  return payload.citations.filter((item): item is CopilotCitation => isObject(item) && typeof item.source === "string");
};

const artifactTypeLabel: Record<CopilotArtifactType, string> = {
  TASK_REWRITE: "Task Rewrite",
  SUBTASKS: "Subtasks",
  RISK_REGISTER: "Risk Register",
  KPI_SET: "KPI Set",
  EXEC_SUMMARY: "Executive Summary",
  PROJECT_INSIGHTS: "Project Insights"
};

const downloadJson = (fileName: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const toMessagePreview = (message: CopilotChatMessageResponse) =>
  message.content.length > 120 ? `${message.content.slice(0, 117)}...` : message.content;

function ArtifactPreview({
  artifact,
  selected,
  onSelect
}: {
  artifact: CopilotArtifactResponse;
  selected: boolean;
  onSelect: (artifactId: string) => void;
}) {
  const artifactType = resolveArtifactType(artifact);
  const data = normalizeArtifactData(artifact.payload);

  const renderSubtasks = () => {
    const items =
      isObject(data) && Array.isArray(data.subtasks)
        ? data.subtasks.filter((row): row is Record<string, unknown> => isObject(row))
        : [];

    if (items.length === 0) {
      return <p className="text-xs text-slate-500">No subtask rows in artifact payload.</p>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Order</th>
              <th className="px-2 py-1 text-left">Subtask</th>
              <th className="px-2 py-1 text-left">Owner</th>
              <th className="px-2 py-1 text-left">Effort</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${artifact.id}-subtask-${index}`} className="border-t border-slate-200">
                <td className="px-2 py-1 text-slate-700">{String(item.order ?? index + 1)}</td>
                <td className="px-2 py-1 text-slate-700">{String(item.title ?? "-")}</td>
                <td className="px-2 py-1 text-slate-600">{String(item.owner ?? "Unknown")}</td>
                <td className="px-2 py-1 text-slate-600">{String(item.effort_estimate ?? "Unknown")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderRisks = () => {
    const items =
      isObject(data) && Array.isArray(data.risks)
        ? data.risks.filter((row): row is Record<string, unknown> => isObject(row))
        : [];

    if (items.length === 0) {
      return <p className="text-xs text-slate-500">No risk rows in artifact payload.</p>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Risk</th>
              <th className="px-2 py-1 text-left">Probability</th>
              <th className="px-2 py-1 text-left">Severity</th>
              <th className="px-2 py-1 text-left">Owner</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${artifact.id}-risk-${index}`} className="border-t border-slate-200">
                <td className="px-2 py-1 text-slate-700">{String(item.title ?? item.risk_statement ?? "-")}</td>
                <td className="px-2 py-1 text-slate-600">{String(item.probability ?? "-")}</td>
                <td className="px-2 py-1 text-slate-600">{String(item.severity ?? "-")}</td>
                <td className="px-2 py-1 text-slate-600">{String(item.owner ?? "Unknown")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderKpis = () => {
    const items =
      isObject(data) && Array.isArray(data.kpis)
        ? data.kpis.filter((row): row is Record<string, unknown> => isObject(row))
        : [];

    if (items.length === 0) {
      return <p className="text-xs text-slate-500">No KPI rows in artifact payload.</p>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">KPI</th>
              <th className="px-2 py-1 text-left">Type</th>
              <th className="px-2 py-1 text-left">Frequency</th>
              <th className="px-2 py-1 text-left">Target</th>
              <th className="px-2 py-1 text-left">Owner</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${artifact.id}-kpi-${index}`} className="border-t border-slate-200">
                <td className="px-2 py-1 text-slate-700">{String(item.name ?? item.kpi ?? "-")}</td>
                <td className="px-2 py-1 text-slate-600">{String(item.type ?? "-")}</td>
                <td className="px-2 py-1 text-slate-600">{String(item.frequency ?? "-")}</td>
                <td className="px-2 py-1 text-slate-600">{String(item.target ?? "-")}</td>
                <td className="px-2 py-1 text-slate-600">{String(item.owner ?? "-")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSummary = () => {
    if (!isObject(data) || !isObject(data.summary)) {
      return <p className="text-xs text-slate-500">No executive summary payload.</p>;
    }

    const summary = data.summary;
    return (
      <div className="space-y-2 text-xs text-slate-700">
        <p>
          <span className="font-semibold">Purpose:</span> {String(summary.purpose ?? "-")}
        </p>
        <p>
          <span className="font-semibold">Current Status:</span> {String(summary.current_status ?? "-")}
        </p>
        {Array.isArray(summary.next_steps) ? (
          <div>
            <p className="font-semibold">Next Steps</p>
            <ul className="list-disc pl-4">
              {summary.next_steps.map((step, index) => (
                <li key={`${artifact.id}-next-${index}`}>{String(step)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  };

  const renderTaskRewrite = () => {
    if (!isObject(data) || !isObject(data.task)) {
      return <p className="text-xs text-slate-500">No task rewrite payload.</p>;
    }

    const task = data.task;
    return (
      <div className="space-y-2 text-xs text-slate-700">
        <p>
          <span className="font-semibold">Title:</span> {String(task.title ?? "-")}
        </p>
        <p>
          <span className="font-semibold">SMART Statement:</span> {String(task.smart_statement ?? "-")}
        </p>
        {Array.isArray(task.acceptance_criteria) && task.acceptance_criteria.length > 0 ? (
          <div>
            <p className="font-semibold">Acceptance Criteria</p>
            <ul className="list-disc pl-4">
              {task.acceptance_criteria.map((criteria, index) => (
                <li key={`${artifact.id}-criteria-${index}`}>{String(criteria)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  };

  const renderInsights = () => {
    if (!isObject(data) || !isObject(data.insights)) {
      return <p className="text-xs text-slate-500">No project insights payload.</p>;
    }
    const insights = data.insights;
    return (
      <div className="space-y-2 text-xs text-slate-700">
        {Array.isArray(insights.quick_wins) && insights.quick_wins.length > 0 ? (
          <div>
            <p className="font-semibold">Quick Wins</p>
            <ul className="list-disc pl-4">
              {insights.quick_wins.map((item, index) => (
                <li key={`${artifact.id}-quick-win-${index}`}>{String(item)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {Array.isArray(insights.likely_blockers) && insights.likely_blockers.length > 0 ? (
          <div>
            <p className="font-semibold">Likely Blockers</p>
            <ul className="list-disc pl-4">
              {insights.likely_blockers.map((item, index) => (
                <li key={`${artifact.id}-blocker-${index}`}>{String(item)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <article
      className={`rounded-lg border p-3 ${selected ? "border-[#b00a30] bg-rose-50/70" : "border-slate-200 bg-white"}`}
    >
      <button
        type="button"
      onClick={() => onSelect(artifact.id)}
        className="w-full text-left"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {artifactTypeLabel[artifactType]}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(artifact.createdAt)}</p>
      </button>
      <div className="mt-3">
        {artifactType === "TASK_REWRITE" ? renderTaskRewrite() : null}
        {artifactType === "SUBTASKS" ? renderSubtasks() : null}
        {artifactType === "RISK_REGISTER" ? renderRisks() : null}
        {artifactType === "KPI_SET" ? renderKpis() : null}
        {artifactType === "EXEC_SUMMARY" ? renderSummary() : null}
        {artifactType === "PROJECT_INSIGHTS" ? renderInsights() : null}
      </div>
    </article>
  );
}

export default function CopilotPanel({
  projectId,
  projectTitle,
  initialMode = "GENERAL",
  className,
  onInsert
}: CopilotPanelProps) {
  const [mode, setMode] = useState<CopilotMode>(initialMode);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? "");
  const [projects, setProjects] = useState<ProjectChoice[]>([]);
  const [templates, setTemplates] = useState<CopilotTemplate[]>(defaultQuickActions);
  const [conversations, setConversations] = useState<CopilotConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<CopilotChatMessageResponse[]>([]);
  const [artifacts, setArtifacts] = useState<CopilotArtifactResponse[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedSnippet, setSelectedSnippet] = useState<string>("");
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<string, number>>({});
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const projectSwitchRef = useRef<string>(projectId ?? "");
  const projectLocked = Boolean(projectId);

  const selectedArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null,
    [artifacts, selectedArtifactId]
  );

  const selectedMessage = useMemo(
    () => messages.find((message) => message.id === selectedMessageId && message.role === "assistant") ?? null,
    [messages, selectedMessageId]
  );

  const selectedEnvelope = selectedMessage ? getEnvelope(selectedMessage) : null;
  const selectedMode = selectedEnvelope?.mode;
  const selectedJson = selectedEnvelope?.data;
  const selectedCitations = getCitations(selectedEnvelope);

  const canSaveSelectedAsArtifact =
    Boolean(selectedMessage) &&
    Boolean(selectedMode && artifactTypeByMode[selectedMode]) &&
    selectedJson !== undefined;

  const selectedExportData = useMemo(() => {
    if (selectedArtifact) {
      return normalizeArtifactData(selectedArtifact.payload);
    }
    if (selectedJson !== undefined) {
      return selectedJson;
    }
    return null;
  }, [selectedArtifact, selectedJson]);

  const selectedInsertText =
    selectedSnippet ||
    selectedMessage?.content ||
    (selectedArtifact ? JSON.stringify(normalizeArtifactData(selectedArtifact.payload), null, 2) : "");

  const loadTemplates = useCallback(async () => {
    try {
      const response = await fetch("/api/copilot/templates");
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as {
        data?: { quickActions?: CopilotTemplate[] };
      };
      if (payload.data?.quickActions?.length) {
        setTemplates(payload.data.quickActions);
      }
    } catch {
      // keep defaults
    }
  }, []);

  const loadProjects = useCallback(async () => {
    if (projectLocked) {
      return;
    }

    try {
      const response = await fetch("/api/submissions");
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as {
        data?: Array<{ id: string; title: string }>;
      };
      const options = (payload.data ?? []).map((item) => ({
        id: item.id,
        title: item.title || "Untitled"
      }));
      setProjects(options);
      if (!selectedProjectId && options[0]?.id) {
        setSelectedProjectId(options[0].id);
      }
    } catch {
      // non-blocking
    }
  }, [projectLocked, selectedProjectId]);

  const loadConversations = useCallback(
    async (nextProjectId?: string) => {
      const projectFilter = nextProjectId ?? selectedProjectId;
      const search = new URLSearchParams();
      if (projectFilter) {
        search.set("projectId", projectFilter);
      }

      const response = await fetch(`/api/copilot/history${search.toString() ? `?${search.toString()}` : ""}`);
      if (!response.ok) {
        const message = await parseApiError(response);
        setError(message);
        setConversations([]);
        return;
      }

      const payload = (await response.json()) as {
        data?: {
          conversations?: CopilotConversationSummary[];
        };
      };
      setConversations(payload.data?.conversations ?? []);
    },
    [selectedProjectId]
  );

  const openConversation = useCallback(async (targetConversationId: string) => {
    const response = await fetch(
      `/api/copilot/history?conversationId=${encodeURIComponent(targetConversationId)}`
    );
    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }

    const payload = (await response.json()) as {
      data?: {
        conversation?: { id: string };
        messages?: CopilotChatMessageResponse[];
        artifacts?: CopilotArtifactResponse[];
      };
    };

    setConversationId(payload.data?.conversation?.id ?? targetConversationId);
    setMessages(payload.data?.messages ?? []);
    setArtifacts(
      [...(payload.data?.artifacts ?? [])].sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime;
      })
    );
    setSelectedArtifactId(payload.data?.artifacts?.[0]?.id ?? null);
    setSelectedMessageId(null);
    setSelectedSnippet("");
  }, []);

  const clearThread = useCallback(async () => {
    setConversationId(undefined);
    setMessages([]);
    setArtifacts([]);
    setSelectedArtifactId(null);
    setSelectedMessageId(null);
    setSelectedSnippet("");
    try {
      await loadConversations();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not refresh conversations.");
    }
  }, [loadConversations]);

  const submitFeedback = useCallback(async (messageId: string, rating: number) => {
    const response = await fetch("/api/copilot/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, rating })
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }

    setFeedbackByMessage((prev) => ({ ...prev, [messageId]: rating }));
  }, []);

  const saveSelectedMessageAsArtifact = useCallback(async () => {
    if (!canSaveSelectedAsArtifact || !selectedMessage || !selectedMode) {
      return;
    }

    const artifactType = artifactTypeByMode[selectedMode];
    if (!artifactType) {
      return;
    }

    const response = await fetch("/api/copilot/artifacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        messageId: selectedMessage.id,
        projectId: selectedProjectId || undefined,
        type: artifactType,
        payload: selectedJson
      })
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }

    const payload = (await response.json()) as { data?: CopilotArtifactResponse };
    if (payload.data) {
      setArtifacts((prev) => mergeArtifacts(prev, [payload.data as CopilotArtifactResponse]));
      setSelectedArtifactId(payload.data.id);
      setStatusMessage("Artifact saved.");
    }
  }, [
    canSaveSelectedAsArtifact,
    conversationId,
    selectedJson,
    selectedMessage,
    selectedMode,
    selectedProjectId
  ]);

  const handleInsert = useCallback(async () => {
    if (!selectedInsertText.trim()) {
      return;
    }

    if (onInsert) {
      onInsert({
        text: selectedInsertText,
        json: selectedExportData ?? undefined,
        artifact: selectedArtifact ?? undefined,
        conversationId
      });
      setStatusMessage("Inserted into parent form.");
      return;
    }

    await navigator.clipboard.writeText(selectedInsertText);
    setStatusMessage("Copied to clipboard.");
  }, [conversationId, onInsert, selectedArtifact, selectedExportData, selectedInsertText]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) {
      return;
    }

    setError(null);
    setStatusMessage(null);
    setLoading(true);

    const optimisticUserId = `tmp-user-${Date.now()}`;
    const optimisticConversationId = conversationId ?? "pending";
    const optimisticMessage: CopilotChatMessageResponse = {
      id: optimisticUserId,
      conversationId: optimisticConversationId,
      role: "user",
      content: text,
      json: null,
      createdAt: new Date().toISOString()
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setInput("");

    try {
      const requestController = new AbortController();
      const timeoutRef = setTimeout(() => requestController.abort(), 65000);

      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          conversationId,
          projectId: selectedProjectId || projectId,
          mode,
          message: text
        }),
        signal: requestController.signal
      });
      clearTimeout(timeoutRef);

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const payload = (await response.json()) as {
        message?: string;
        warnings?: string[];
        data?: {
          conversationId: string;
          assistantMessage: CopilotChatMessageResponse;
          artifacts: CopilotArtifactResponse[];
        };
      };

      const data = payload.data;
      if (!data?.assistantMessage) {
        throw new Error("Invalid Copilot response.");
      }

      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== optimisticUserId),
        {
          ...optimisticMessage,
          conversationId: data.conversationId
        },
        data.assistantMessage
      ]);
      setArtifacts((prev) => mergeArtifacts(prev, data.artifacts ?? []));
      setSelectedMessageId(data.assistantMessage.id);
      if (data.artifacts?.[0]?.id) {
        setSelectedArtifactId(data.artifacts[0].id);
      }
      if (Array.isArray(payload.warnings) && payload.warnings.length > 0) {
        setStatusMessage(payload.warnings.join(" | "));
      }

      try {
        await loadConversations(selectedProjectId);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not refresh conversation list.");
      }
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : "Copilot request failed."
      );
      setMessages((prev) => prev.filter((message) => message.id !== optimisticUserId));
    } finally {
      setLoading(false);
    }
  }, [
    conversationId,
    input,
    loadConversations,
    loading,
    mode,
    projectId,
    selectedProjectId
  ]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (projectId) {
      setSelectedProjectId(projectId);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectSwitchRef.current === selectedProjectId) {
      return;
    }

    projectSwitchRef.current = selectedProjectId;
    setConversationId(undefined);
    setMessages([]);
    setArtifacts([]);
    setSelectedArtifactId(null);
    setSelectedMessageId(null);
    setSelectedSnippet("");
  }, [selectedProjectId]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadConversations().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Could not load conversation history.");
      setConversations([]);
    });
  }, [loadConversations]);

  useEffect(() => {
    if (!transcriptRef.current) {
      return;
    }
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages.length, loading]);

  const onQuickAction = (template: CopilotTemplate) => {
    setMode(template.mode);
    setInput(template.prompt);
  };

  const onMessageMouseUp = (messageId: string) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }
    const text = selection.toString().trim();
    if (!text) {
      return;
    }
    setSelectedMessageId(messageId);
    setSelectedSnippet(text);
  };

  const projectLabel = useMemo(() => {
    if (projectTitle) {
      return `${selectedProjectId || projectId || "No Project"} - ${projectTitle}`;
    }

    const match = projects.find((item) => item.id === selectedProjectId);
    return match ? `${match.id} - ${match.title}` : selectedProjectId || "Select project";
  }, [projectId, projectTitle, projects, selectedProjectId]);

  return (
    <section className={`flex min-h-[520px] flex-col rounded-xl border border-slate-200 bg-white ${className ?? ""}`}>
      <header className="border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">Project Copilot</h2>
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b00a30]">
            {projectLabel}
          </span>
          <button
            type="button"
            onClick={() => {
              void clearThread();
            }}
            className="ml-auto rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            New chat
          </button>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-[1.2fr_1fr]">
          <label className="text-xs font-medium text-slate-600">
            Project Context
            <select
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              disabled={projectLocked}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
            >
              {projectLocked && projectId ? (
                <option value={projectId}>{projectLabel}</option>
              ) : null}
              {!projectLocked
                ? projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.id} - {project.title}
                    </option>
                  ))
                : null}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-600">
            Mode
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as CopilotMode)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {COPILOT_MODES.map((item) => (
                <option key={item} value={item}>
                  {modeLabels[item]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onQuickAction(template)}
              className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-[#b00a30] hover:bg-rose-100"
              title={template.description}
            >
              {template.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[260px_1fr_340px]">
        <aside className="min-h-0 border-r border-slate-200">
          <div className="border-b border-slate-200 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">History</p>
          </div>
          <div className="h-full max-h-[500px] space-y-1 overflow-y-auto p-2">
            {conversations.length === 0 ? (
              <p className="px-2 py-3 text-xs text-slate-500">No conversations yet.</p>
            ) : null}
            {conversations.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  void openConversation(item.id).catch((openError) =>
                    setError(openError instanceof Error ? openError.message : "Failed to load conversation.")
                  );
                }}
                className={`w-full rounded-md border px-2 py-2 text-left ${
                  conversationId === item.id
                    ? "border-[#b00a30] bg-rose-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <p className="text-xs font-semibold text-slate-800">{item.title ?? "Untitled conversation"}</p>
                <p className="mt-1 text-[11px] text-slate-500">{item.lastMessagePreview ?? "No messages yet"}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                  {formatDateTime(item.updatedAt)}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-h-0 flex-col border-r border-slate-200">
          <div ref={transcriptRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <article className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600">
                Ask Project Copilot for task rewrites, risk registers, KPIs, executive summaries, and project insights.
              </article>
            ) : null}

            {messages.map((message) => {
              const isAssistant = message.role === "assistant";
              const envelope = isAssistant ? getEnvelope(message) : null;
              const citations = getCitations(envelope);

              return (
                <article
                  key={message.id}
                  className={`rounded-lg border px-3 py-2 ${
                    isAssistant
                      ? selectedMessageId === message.id
                        ? "border-[#b00a30] bg-rose-50/70"
                        : "border-slate-200 bg-white"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {message.role}
                    </p>
                    <p className="text-[11px] text-slate-400">{formatDateTime(message.createdAt)}</p>
                  </div>
                  <div
                    className="mt-1 whitespace-pre-wrap text-sm text-slate-800"
                    onMouseUp={() => onMessageMouseUp(message.id)}
                  >
                    {message.content}
                  </div>

                  {isAssistant ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                        onClick={() => {
                          setSelectedMessageId(message.id);
                          setSelectedSnippet(message.content);
                        }}
                      >
                        Select response
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                        onClick={async () => {
                          await navigator.clipboard.writeText(message.content);
                          setStatusMessage("Response copied.");
                        }}
                      >
                        Copy
                      </button>
                      <div className="ml-auto flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={`${message.id}-${value}`}
                            type="button"
                            className={`h-6 w-6 rounded-full text-[11px] font-semibold ${
                              feedbackByMessage[message.id] === value
                                ? "bg-[#b00a30] text-white"
                                : "border border-slate-300 text-slate-600 hover:bg-slate-50"
                            }`}
                            onClick={() =>
                              void submitFeedback(message.id, value).catch((submitError) =>
                                setError(
                                  submitError instanceof Error
                                    ? submitError.message
                                    : "Could not save message feedback."
                                )
                              )
                            }
                            title={`Rate ${value}/5`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {citations.length > 0 ? (
                    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Citations
                      </p>
                      <ul className="mt-1 space-y-1 text-xs text-slate-600">
                        {citations.map((citation, index) => (
                          <li key={`${message.id}-citation-${index}`}>
                            <span className="font-semibold">{citation.source}:</span> {citation.label}
                            {citation.detail ? ` (${citation.detail})` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="border-t border-slate-200 p-3">
            <label className="text-xs font-medium text-slate-600">
              Message
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="mt-1 h-24 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                placeholder="Ask Project Copilot..."
              />
            </label>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={loading || !input.trim() || !selectedProjectId}
                onClick={() => {
                  void sendMessage();
                }}
                className="rounded-md accent-bg px-3 py-2 text-xs font-semibold disabled:opacity-60"
              >
                {loading ? "Generating..." : "Send"}
              </button>
              <p className="text-xs text-slate-500">
                {!selectedProjectId
                  ? "Select a project context to run STRATOS."
                  : loading
                    ? "Generating structured response..."
                    : "Responses persist to conversation history."}
              </p>
            </div>
          </div>
        </div>

        <aside className="flex min-h-0 flex-col">
          <div className="border-b border-slate-200 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Artifacts</p>
          </div>
          <div className="border-b border-slate-200 px-3 py-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleInsert();
                }}
                disabled={!selectedInsertText.trim()}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
              >
                Insert into form
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedExportData !== null) {
                    void navigator.clipboard.writeText(JSON.stringify(selectedExportData, null, 2));
                    setStatusMessage("JSON copied.");
                  }
                }}
                disabled={selectedExportData === null}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
              >
                Copy JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedExportData !== null) {
                    downloadJson(`copilot-${mode.toLowerCase()}-${Date.now()}.json`, selectedExportData);
                  }
                }}
                disabled={selectedExportData === null}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
              >
                Download JSON
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                void saveSelectedMessageAsArtifact().catch((saveError) =>
                  setError(saveError instanceof Error ? saveError.message : "Failed to save artifact.")
                );
              }}
              disabled={!canSaveSelectedAsArtifact || !conversationId}
              className="mt-2 rounded-md accent-bg px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
            >
              Save as artifact
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {artifacts.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-500">
                Structured artifacts appear here (task rewrite, subtasks, risk register, KPI set, executive summary, insights).
              </p>
            ) : null}

            {artifacts.map((artifact) => (
              <ArtifactPreview
                key={artifact.id}
                artifact={artifact}
                selected={selectedArtifactId === artifact.id}
                onSelect={(artifactId) => {
                  setSelectedArtifactId(artifactId);
                  setSelectedSnippet("");
                }}
              />
            ))}

            {selectedArtifact ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Artifact Citations
                </p>
                {getArtifactCitations(selectedArtifact.payload).length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">No citations attached.</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-xs text-slate-600">
                    {getArtifactCitations(selectedArtifact.payload).map((citation, index) => (
                      <li key={`${selectedArtifact.id}-cit-${index}`}>
                        <span className="font-semibold">{citation.source}:</span> {citation.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {selectedCitations.length > 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Message Citations
                </p>
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {selectedCitations.map((citation, index) => (
                    <li key={`selected-message-citation-${index}`}>
                      <span className="font-semibold">{citation.source}:</span> {citation.label}
                      {citation.detail ? ` (${citation.detail})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selectedMessage ? (
              <div className="rounded-md border border-slate-200 bg-white p-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Selected Response
                </p>
                <p className="mt-1 text-xs text-slate-700">{toMessagePreview(selectedMessage)}</p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {(error || statusMessage) && (
        <footer className="border-t border-slate-200 px-4 py-2">
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
          {!error && statusMessage ? <p className="text-xs text-emerald-700">{statusMessage}</p> : null}
        </footer>
      )}
    </section>
  );
}
