import { z } from "zod";

import type { CopilotArtifactType, CopilotMode } from "@/lib/copilot/types";

const versionSchema = z.literal("1.0");

export const taskRewriteSchema = z.object({
  type: z.literal("TASK_REWRITE"),
  version: versionSchema,
  task: z.object({
    title: z.string(),
    smart_statement: z.string(),
    scope_in: z.array(z.string()),
    scope_out: z.array(z.string()),
    deliverables: z.array(z.string()),
    acceptance_criteria: z.array(z.string()),
    due_date: z.string(),
    dependencies: z.array(z.string()),
    assumptions: z.array(z.string())
  })
});

export const subtasksSchema = z.object({
  type: z.literal("SUBTASKS"),
  version: versionSchema,
  parent_task: z.object({
    title: z.string(),
    id: z.string()
  }),
  subtasks: z.array(
    z.object({
      order: z.number().int().positive(),
      title: z.string(),
      description: z.string(),
      owner: z.string(),
      effort_estimate: z.string(),
      dependencies: z.array(z.string()),
      acceptance_criteria: z.array(z.string())
    })
  )
});

const probabilitySchema = z.enum(["Low", "Medium", "High"]);
const severitySchema = z.enum(["Low", "Medium", "High"]);

export const riskRegisterSchema = z.object({
  type: z.literal("RISK_REGISTER"),
  version: versionSchema,
  risks: z.array(
    z.object({
      risk_id: z.string(),
      title: z.string(),
      risk_statement: z.string(),
      cause: z.string(),
      impact: z.string(),
      probability: probabilitySchema,
      severity: severitySchema,
      mitigation: z.string(),
      contingency: z.string(),
      owner: z.string(),
      due_date: z.string(),
      early_warning_indicators: z.array(z.string())
    })
  )
});

export const kpiSetSchema = z.object({
  type: z.literal("KPI_SET"),
  version: versionSchema,
  kpis: z.array(
    z.object({
      kpi_id: z.string(),
      name: z.string(),
      type: z.enum(["Leading", "Lagging"]),
      definition: z.string(),
      formula: z.string(),
      baseline: z.string(),
      target: z.string(),
      frequency: z.enum(["Weekly", "Monthly", "Quarterly", "Adhoc"]),
      data_source: z.string(),
      owner: z.string(),
      notes: z.string()
    })
  )
});

export const execSummarySchema = z.object({
  type: z.literal("EXEC_SUMMARY"),
  version: versionSchema,
  summary: z.object({
    purpose: z.string(),
    current_status: z.string(),
    value_and_benefits: z.array(z.string()),
    key_milestones: z.array(z.string()),
    key_risks_and_issues: z.array(z.string()),
    decisions_needed: z.array(z.string()),
    next_steps: z.array(z.string())
  })
});

export const projectInsightsSchema = z.object({
  type: z.literal("PROJECT_INSIGHTS"),
  version: versionSchema,
  insights: z.object({
    what_looks_strong: z.array(z.string()),
    blind_spots: z.array(z.string()),
    missing_information: z.array(z.string()),
    likely_blockers: z.array(z.string()),
    quick_wins: z.array(z.string()),
    recommended_next_actions: z.array(z.string()),
    recommended_next_artifacts: z.array(
      z.enum(["RISK_REGISTER", "KPI_SET", "TASK_REWRITE", "SUBTASKS", "EXEC_SUMMARY"])
    )
  })
});

export const artifactSchemaByType = {
  TASK_REWRITE: taskRewriteSchema,
  SUBTASKS: subtasksSchema,
  RISK_REGISTER: riskRegisterSchema,
  KPI_SET: kpiSetSchema,
  EXEC_SUMMARY: execSummarySchema,
  PROJECT_INSIGHTS: projectInsightsSchema
} as const satisfies Record<CopilotArtifactType, z.ZodTypeAny>;

export const modeToArtifactType = {
  TASK_REWRITE: "TASK_REWRITE",
  SUBTASKS: "SUBTASKS",
  RISK_REGISTER: "RISK_REGISTER",
  KPI_SET: "KPI_SET",
  EXEC_SUMMARY: "EXEC_SUMMARY",
  PROJECT_INSIGHTS: "PROJECT_INSIGHTS"
} as const satisfies Partial<Record<CopilotMode, CopilotArtifactType>>;

export const isArtifactMode = (mode: CopilotMode): mode is keyof typeof modeToArtifactType =>
  mode in modeToArtifactType;

export type ParsedArtifact = {
  artifactType: CopilotArtifactType;
  data: unknown;
};

const extractWithRegex = (input: string, expression: RegExp) => {
  const match = input.match(expression);
  return match?.[1]?.trim() ?? null;
};

export const extractJsonPayload = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return trimmed;
  }

  const markerJson = extractWithRegex(trimmed, /\[\[COPILOT_JSON\]\]\s*([\s\S]*?)\s*\[\[\/COPILOT_JSON\]\]/i);
  if (markerJson) {
    return markerJson;
  }

  const fencedJson = extractWithRegex(trimmed, /```json\s*([\s\S]*?)\s*```/i);
  if (fencedJson) {
    return fencedJson;
  }

  const objectBlock = extractWithRegex(trimmed, /(\{[\s\S]*\})/);
  if (objectBlock) {
    return objectBlock;
  }

  return null;
};

export const parseAndValidateArtifact = (
  mode: CopilotMode,
  raw: string
): { artifact: ParsedArtifact | null; error?: string } => {
  if (!isArtifactMode(mode)) {
    return { artifact: null };
  }

  const jsonPayload = extractJsonPayload(raw);
  if (!jsonPayload) {
    return { artifact: null, error: "No JSON payload found in model response." };
  }

  try {
    const parsed = JSON.parse(jsonPayload) as unknown;
    const artifactType = modeToArtifactType[mode];
    const schema = artifactSchemaByType[artifactType];
    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      return { artifact: null, error: validated.error.errors.map((e) => e.message).join("; ") };
    }
    return {
      artifact: {
        artifactType,
        data: validated.data
      }
    };
  } catch (error) {
    return {
      artifact: null,
      error: error instanceof Error ? error.message : "Failed to parse artifact JSON."
    };
  }
};

