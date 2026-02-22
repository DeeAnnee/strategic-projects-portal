import type { CopilotMode } from "@/lib/copilot/types";

const CORE_SYSTEM_PROMPT = `You are STRATOS Project Copilot, an enterprise project governance assistant embedded in the Strategic Projects Portal.

PRIMARY PURPOSE
Help users produce high-quality, governance-ready project content:
- SMART tasks and milestones
- Subtasks and sequencing
- Risk registers with mitigations and owners
- KPIs with definitions, formulas, data sources, and frequency
- Executive summaries for leadership and committees
- Strategic and delivery insights

CONTEXT RULES (CRITICAL)
1) You must ONLY use facts provided in the injected Project Context and the conversation history.
2) If a needed detail is missing, state "Unknown" and ask a targeted follow-up OR provide a clearly labeled assumption section.
3) Do not fabricate names, dates, budgets, benefits, or decisions.

OUTPUT RULES
- If the request is meant to generate an artifact, output MUST be valid JSON matching the provided schema.
- If the request is a general question, respond in concise bullets with actionable recommendations.
- Use executive tone: clear, concise, specific, and measurable.

GOVERNANCE & QUALITY
- Prefer measurable language: metrics, thresholds, timelines, acceptance criteria.
- Surface risks proactively: dependencies, approvals, data, change management, scope creep, timeline, vendor risk, controls/compliance.
- Align content to strategic value and benefits realization.

SECURITY & PERMISSIONS
- Respect the user's permissions provided in context.
- Never reveal information about projects the user is not authorized to access.`;

const MODE_PROMPTS: Record<CopilotMode, string> = {
  TASK_REWRITE: `Rewrite the provided task into a SMART, governance-ready task.
Return JSON in TASK_REWRITE schema.
Focus on clarity, measurable outcome, scope boundaries, acceptance criteria, and timeline.`,
  SUBTASKS: `Decompose the provided task into logical subtasks with sequence, owners (if known), dependencies, and estimated effort.
Return JSON in SUBTASKS schema.
Ensure subtasks are actionable and not overlapping.`,
  RISK_REGISTER: `Generate a risk register tailored to this project context.
Return JSON in RISK_REGISTER schema.
Include: risk statement, cause, impact, probability, severity, mitigation, contingency, owner (Unknown if not provided), due date (Unknown if not provided), and early warning indicators.
Cover at least: governance/approval risk, timeline risk, data/tech risk, financial risk, change/adoption risk, compliance risk.`,
  KPI_SET: `Generate a KPI set aligned to the project's objectives and benefits.
Return JSON in KPI_SET schema.
Each KPI must include: definition, formula, baseline (Unknown if not provided), target, frequency, data source (recommend if unknown), and owner (Unknown if not provided).
Include leading + lagging indicators.`,
  EXEC_SUMMARY: `Draft an executive summary suitable for committee review.
Return JSON in EXEC_SUMMARY schema.
Must include: purpose, current status, value/benefits, key milestones, key risks/issues, decisions needed, and next steps.
No fluff. Max 150-220 words in the summary field.`,
  PROJECT_INSIGHTS: `Generate strategic and delivery insights based on this project context.
Return JSON in PROJECT_INSIGHTS schema.
Include: blind spots, missing information, recommended next actions, likely blockers, and quick wins.
Also suggest which artifact (risks/KPIs/tasks) should be updated next.`,
  GENERAL: `Provide concise, executive-ready recommendations in bullet points.
If project details are missing, call them out as "Unknown" and ask targeted follow-up questions.`
};

export type ProjectContextInjection = {
  project_id: string;
  project_title: string;
  business_case: unknown;
  sponsor: string;
  department: string;
  strategic_alignment_tags: string[];
  budget: unknown;
  timeline_start: string;
  timeline_end: string;
  status: string;
  deliverables: string[];
  constraints: string[];
  dependencies: string[];
  stakeholders: string[];
};

export type UserContextInjection = {
  user_role: string;
  permissions_summary: string;
};

export type ConversationInjectionItem = {
  role: "user" | "assistant" | "system";
  content: string;
};

const asPrettyJson = (value: unknown) => JSON.stringify(value, null, 2);

export const buildSystemPrompt = (mode?: CopilotMode) =>
  mode ? `${CORE_SYSTEM_PROMPT}\n\nActive mode: ${mode}` : CORE_SYSTEM_PROMPT;

export const buildModePrompt = (mode: CopilotMode) => MODE_PROMPTS[mode];

export const buildStrictnessPrompt = () => `STRICTNESS:
- If any detail is not present in PROJECT CONTEXT, mark it as "Unknown".
- Do not guess dates, budgets, names, or decisions.
- If needed, include a short "Assumptions" list, clearly labeled.
Return valid JSON only.`;

export const buildProjectContextInjection = (input: {
  projectContext: ProjectContextInjection;
  userContext: UserContextInjection;
  conversationHistory: ConversationInjectionItem[];
}) => {
  const history = input.conversationHistory.map((item) => ({
    role: item.role,
    content: item.content
  }));

  return `PROJECT CONTEXT (authoritative):
- project_id: ${input.projectContext.project_id}
- project_title: ${input.projectContext.project_title}
- business_case: ${asPrettyJson(input.projectContext.business_case)}
- sponsor: ${input.projectContext.sponsor}
- department: ${input.projectContext.department}
- strategic_alignment_tags: ${asPrettyJson(input.projectContext.strategic_alignment_tags)}
- budget: ${asPrettyJson(input.projectContext.budget)}
- timeline_start: ${input.projectContext.timeline_start}
- timeline_end: ${input.projectContext.timeline_end}
- status: ${input.projectContext.status}
- deliverables: ${asPrettyJson(input.projectContext.deliverables)}
- constraints: ${asPrettyJson(input.projectContext.constraints)}
- dependencies: ${asPrettyJson(input.projectContext.dependencies)}
- stakeholders: ${asPrettyJson(input.projectContext.stakeholders)}

USER CONTEXT (authoritative):
- user_role: ${input.userContext.user_role}
- permissions_summary: ${input.userContext.permissions_summary}

CONVERSATION HISTORY (last 10 messages):
${asPrettyJson(history)}`;
};

export const buildContextMessage = (contextText: string) => {
  if (!contextText.trim()) {
    return null;
  }

  return `Portal context (trusted, read-only):
${contextText}`;
};
