import type { CopilotTemplate } from "@/lib/copilot/types";

export const copilotTemplates: CopilotTemplate[] = [
  {
    id: "improve-task",
    label: "Improve my task",
    mode: "TASK_BUILDER",
    prompt:
      "Rewrite this into SMART format with clear owner, effort, dependencies, risks, and KPIs:\n<Task draft here>",
    description: "Converts rough work statements into SMART execution tasks."
  },
  {
    id: "break-subtasks",
    label: "Break into subtasks",
    mode: "TASK_BUILDER",
    prompt:
      "Break this initiative into sequenced subtasks, call out dependencies, and suggest milestone checks:\n<Initiative summary here>",
    description: "Creates dependency-aware subtask decomposition."
  },
  {
    id: "generate-risks",
    label: "Generate risks",
    mode: "RISKS",
    prompt:
      "Generate a practical risk register for this project with mitigation owners and measurable controls:",
    description: "Builds a risk register with likelihood, impact, and mitigation actions."
  },
  {
    id: "generate-kpis",
    label: "Generate KPIs",
    mode: "KPIS",
    prompt:
      "Propose KPI set for this project, including formulas, frequency, targets, and owners:",
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
    mode: "INSIGHTS",
    prompt:
      "Using this project context, provide drivers of delay, gaps, risks, KPIs, next best actions, and steering-committee questions.",
    description: "Data-aware analysis from portal project metadata and governance signals."
  }
];
