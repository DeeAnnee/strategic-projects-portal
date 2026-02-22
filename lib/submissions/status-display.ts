import type { ProjectSubmission } from "@/lib/submissions/types";
import { resolveCanonicalWorkflowState } from "@/lib/submissions/workflow";

type StatusInput = Pick<ProjectSubmission, "stage" | "status" | "workflow">;

export const getSubmissionStatusLabel = (submission: StatusInput): string => {
  const { status } = resolveCanonicalWorkflowState(submission);
  if (status === "DRAFT") return "Draft";
  if (status === "SPONSOR_REVIEW") return "Sponsor Review";
  if (status === "PGO_FGO_REVIEW") return "PGO/FGO Review";
  if (status === "SPO_REVIEW") return "SPO Review";
  if (status === "REJECTED") return "Rejected";
  if (status === "APPROVED") return "Approved";
  if (status === "ACTIVE") return "Active";
  if (status === "CHANGE_REVIEW") return "Change Requested";
  return String(submission.status ?? "");
};
