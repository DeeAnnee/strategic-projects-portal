import { z } from "zod";

import type { CopilotArtifactType, CopilotMode } from "@/lib/copilot/types";

const taskItemSchema = z.object({
  taskName: z.string().min(1),
  description: z.string().min(1),
  owner: z.string().optional(),
  effortHours: z.number().nonnegative().optional(),
  priority: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
  kpis: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([])
});

const riskItemSchema = z.object({
  risk: z.string().min(1),
  category: z.string().min(1),
  likelihood: z.enum(["Low", "Medium", "High"]).or(z.string().min(1)),
  impact: z.enum(["Low", "Medium", "High"]).or(z.string().min(1)),
  mitigation: z.string().min(1),
  owner: z.string().optional(),
  metric: z.string().optional()
});

const kpiItemSchema = z.object({
  kpi: z.string().min(1),
  definition: z.string().min(1),
  formula: z.string().optional(),
  frequency: z.string().min(1),
  target: z.string().optional(),
  owner: z.string().optional()
});

const qualityScoreSchema = z.object({
  score0to100: z.number().min(0).max(100),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([])
});

const taskPayloadSchema = z.object({
  tasks: z.array(taskItemSchema),
  qualityScore: qualityScoreSchema.optional()
});

const risksPayloadSchema = z.object({
  risks: z.array(riskItemSchema)
});

const kpisPayloadSchema = z.object({
  kpis: z.array(kpiItemSchema)
});

const execSummaryPayloadSchema = z.object({
  executiveSummary: z.object({
    objective: z.string(),
    currentStatus: z.string(),
    keyWins: z.array(z.string()).default([]),
    issues: z.array(z.string()).default([]),
    nextSteps: z.array(z.string()).default([]),
    asks: z.array(z.string()).default([])
  })
});

const insightsPayloadSchema = z.object({
  insights: z.object({
    topDriversOfDelay: z.array(z.string()).default([]),
    missingInformation: z.array(z.string()).default([]),
    suggestedNextSteps: z.array(z.string()).default([]),
    steeringCommitteeQuestions: z.array(z.string()).default([])
  }),
  risks: z.array(riskItemSchema).default([]),
  kpis: z.array(kpiItemSchema).default([]),
  qualityScore: qualityScoreSchema.optional()
});

type ParsedStructuredOutput = {
  cleanText: string;
  jsonData: unknown | null;
  artifacts: Array<{ type: CopilotArtifactType; payload: unknown }>;
};

const stripJsonMarkers = (text: string) =>
  text
    .replace(/\[\[COPILOT_JSON\]\][\s\S]*?\[\[\/COPILOT_JSON\]\]/gi, "")
    .replace(/```json[\s\S]*?```/gi, "")
    .trim();

const extractJsonText = (text: string): string | null => {
  const markerMatch = text.match(/\[\[COPILOT_JSON\]\]\s*([\s\S]*?)\s*\[\[\/COPILOT_JSON\]\]/i);
  if (markerMatch?.[1]) {
    return markerMatch[1].trim();
  }

  const fencedMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return null;
};

const normalizeModeJson = (mode: CopilotMode, raw: unknown) => {
  switch (mode) {
    case "TASK_BUILDER": {
      const normalized = Array.isArray(raw) ? { tasks: raw } : raw;
      const parsed = taskPayloadSchema.safeParse(normalized);
      return parsed.success ? parsed.data : null;
    }
    case "RISKS": {
      const normalized = Array.isArray(raw) ? { risks: raw } : raw;
      const parsed = risksPayloadSchema.safeParse(normalized);
      return parsed.success ? parsed.data : null;
    }
    case "KPIS": {
      const normalized = Array.isArray(raw) ? { kpis: raw } : raw;
      const parsed = kpisPayloadSchema.safeParse(normalized);
      return parsed.success ? parsed.data : null;
    }
    case "EXEC_SUMMARY": {
      const normalized =
        raw && typeof raw === "object" && "objective" in (raw as Record<string, unknown>)
          ? { executiveSummary: raw }
          : raw;
      const parsed = execSummaryPayloadSchema.safeParse(normalized);
      return parsed.success ? parsed.data : null;
    }
    case "INSIGHTS": {
      const parsed = insightsPayloadSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    }
    default:
      return null;
  }
};

const artifactsForMode = (mode: CopilotMode, jsonData: unknown) => {
  if (!jsonData || typeof jsonData !== "object") {
    return [] as Array<{ type: CopilotArtifactType; payload: unknown }>;
  }

  const data = jsonData as Record<string, unknown>;

  if (mode === "TASK_BUILDER") {
    return [{ type: "TASKS" as const, payload: data }];
  }
  if (mode === "RISKS") {
    return [{ type: "RISKS" as const, payload: data }];
  }
  if (mode === "KPIS") {
    return [{ type: "KPIS" as const, payload: data }];
  }
  if (mode === "EXEC_SUMMARY") {
    return [{ type: "EXEC_SUMMARY" as const, payload: data }];
  }
  if (mode === "INSIGHTS") {
    const derived: Array<{ type: CopilotArtifactType; payload: unknown }> = [];
    if (Array.isArray(data.risks) && data.risks.length > 0) {
      derived.push({ type: "RISKS", payload: { risks: data.risks } });
    }
    if (Array.isArray(data.kpis) && data.kpis.length > 0) {
      derived.push({ type: "KPIS", payload: { kpis: data.kpis } });
    }
    return derived;
  }

  return [];
};

export const parseStructuredOutput = (mode: CopilotMode, text: string): ParsedStructuredOutput => {
  const jsonText = extractJsonText(text);
  const cleanText = stripJsonMarkers(text);

  if (!jsonText) {
    return {
      cleanText,
      jsonData: null,
      artifacts: []
    };
  }

  try {
    const raw = JSON.parse(jsonText);
    const normalized = normalizeModeJson(mode, raw);

    if (!normalized) {
      return {
        cleanText,
        jsonData: raw,
        artifacts: []
      };
    }

    return {
      cleanText,
      jsonData: normalized,
      artifacts: artifactsForMode(mode, normalized)
    };
  } catch {
    return {
      cleanText,
      jsonData: null,
      artifacts: []
    };
  }
};
