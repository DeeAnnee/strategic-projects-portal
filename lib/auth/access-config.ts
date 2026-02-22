export const FUNCTION_RIGHTS = [
  "manage_reference_data",
  "manage_user_rights",
  "run_workflow_actions",
  "sponsor_decision",
  "export_reports",
  "view_all_submissions"
] as const;

export type FunctionRight = (typeof FUNCTION_RIGHTS)[number];
export type FunctionAccess = Record<FunctionRight, boolean>;

export const functionRightLabels: Record<FunctionRight, string> = {
  manage_reference_data: "Manage reference lists",
  manage_user_rights: "Manage users & rights",
  run_workflow_actions: "Run workflow actions",
  sponsor_decision: "Sponsor approval decisions",
  export_reports: "Export reports (PDF/Excel/PPT)",
  view_all_submissions: "View all submissions"
};
