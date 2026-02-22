import type { CopilotTemplate } from "@/lib/copilot/types";

export const copilotTemplates: CopilotTemplate[] = [
  {
    id: "improve-task",
    label: "Improve my task",
    mode: "TASK_REWRITE",
    prompt:
      "Rewrite the provided task into a SMART, governance-ready task with measurable outcome, scope boundaries, acceptance criteria, and timeline.",
    description: "Converts a rough task into a SMART governance-ready task artifact."
  },
  {
    id: "break-subtasks",
    label: "Break into subtasks",
    mode: "SUBTASKS",
    prompt:
      "Decompose the provided task into sequenced subtasks with dependencies, effort estimates, and acceptance criteria.",
    description: "Creates structured subtask sequencing for execution planning."
  },
  {
    id: "generate-risks",
    label: "Generate risks",
    mode: "RISK_REGISTER",
    prompt:
      "Generate a project-specific risk register with causes, impacts, mitigation, contingency, owners, and early warning indicators.",
    description: "Builds a governance-ready risk register."
  },
  {
    id: "generate-kpis",
    label: "Generate KPIs",
    mode: "KPI_SET",
    prompt:
      "Generate leading and lagging KPIs with formulas, targets, frequency, data sources, and owners.",
    description: "Builds KPI definitions aligned to objectives and benefits."
  },
  {
    id: "draft-exec-summary",
    label: "Draft exec summary",
    mode: "EXEC_SUMMARY",
    prompt:
      "Draft a concise committee-ready executive summary with purpose, status, value, milestones, key risks/issues, decisions needed, and next steps.",
    description: "Creates an executive summary suitable for governance committees."
  },
  {
    id: "insights-project",
    label: "Insights from this project",
    mode: "PROJECT_INSIGHTS",
    prompt:
      "Generate strategic and delivery insights, blind spots, likely blockers, quick wins, and recommended next artifacts to update.",
    description: "Produces insight-focused decision support from project context."
  }
];

