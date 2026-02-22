import type {
  ProjectStage,
  ProjectStatus,
  ProjectSubmission,
  WorkflowAction,
  WorkflowEntityType,
  WorkflowLifecycleStatus,
  WorkflowState
} from "@/lib/submissions/types";

export type WorkflowContext = {
  stage: ProjectStage | string;
  status: ProjectStatus | string;
  workflow: WorkflowState;
};

const CANONICAL_STAGES = new Set<ProjectStage>(["PROPOSAL", "FUNDING", "LIVE"]);
const CANONICAL_STATUSES = new Set<ProjectStatus>([
  "DRAFT",
  "SPONSOR_REVIEW",
  "PGO_FGO_REVIEW",
  "SPO_REVIEW",
  "REJECTED",
  "APPROVED",
  "ACTIVE",
  "CHANGE_REVIEW"
]);

const LEGACY_STAGE_TO_CANONICAL: Record<string, ProjectStage> = {
  "PLACEMAT PROPOSAL": "PROPOSAL",
  "SPONSOR APPROVAL": "PROPOSAL",
  "PGO & FINANCE REVIEW": "PROPOSAL",
  "SPO COMMITTEE REVIEW": "PROPOSAL",
  "FUNDING REQUEST": "FUNDING",
  "LIVE PROJECT": "LIVE",
  "CHANGE REQUEST": "LIVE",
  "CHANGE REQUEST (IF REQUIRED)": "LIVE"
};

const normalizeText = (value?: string | null) => (value ?? "").trim();

export const normalizeProjectStage = (
  stage: ProjectStage | string,
  workflow?: Pick<WorkflowState, "entityType" | "fundingStatus">
): ProjectStage => {
  const normalized = normalizeText(stage).toUpperCase();
  if (CANONICAL_STAGES.has(normalized as ProjectStage)) {
    return normalized as ProjectStage;
  }

  const fromLegacy = LEGACY_STAGE_TO_CANONICAL[normalized];
  if (fromLegacy) {
    return fromLegacy;
  }

  if (workflow?.entityType === "FUNDING_REQUEST" || workflow?.fundingStatus === "Funded" || workflow?.fundingStatus === "Live") {
    return "FUNDING";
  }

  return "PROPOSAL";
};

const mapLegacyStatusToCanonical = (
  legacyStatus: string,
  stage: ProjectStage
): ProjectStatus | null => {
  const normalized = legacyStatus.trim().toUpperCase();
  if (!normalized) return null;

  if (normalized === "DRAFT") return "DRAFT";
  if (normalized === "SENT FOR APPROVAL") return "SPONSOR_REVIEW";
  if (normalized === "SUBMITTED" || normalized === "AT SPO REVIEW") {
    return stage === "PROPOSAL" ? "PGO_FGO_REVIEW" : "PGO_FGO_REVIEW";
  }
  if (normalized === "APPROVED") {
    if (stage === "FUNDING") return "APPROVED";
    if (stage === "LIVE") return "ACTIVE";
    return "SPO_REVIEW";
  }
  if (normalized === "REJECTED") return "REJECTED";
  if (normalized === "RETURNED TO SUBMITTER") return "DRAFT";
  if (normalized === "DEFERRED" || normalized === "CANCELLED") return "CHANGE_REVIEW";

  return null;
};

export const normalizeProjectStatus = (
  status: ProjectStatus | string,
  stage: ProjectStage,
  workflow?: Pick<WorkflowState, "lifecycleStatus">
): ProjectStatus => {
  const normalized = normalizeText(status).toUpperCase();
  if (CANONICAL_STATUSES.has(normalized as ProjectStatus)) {
    return normalized as ProjectStatus;
  }

  const fromLegacy = mapLegacyStatusToCanonical(normalized, stage);
  if (fromLegacy) {
    return fromLegacy;
  }

  if (workflow?.lifecycleStatus) {
    return mapLifecycleToStageStatus(workflow.lifecycleStatus).status;
  }

  if (stage === "LIVE") return "ACTIVE";
  return "DRAFT";
};

const lifecycleFromCanonical = (
  stage: ProjectStage,
  status: ProjectStatus
): WorkflowLifecycleStatus => {
  if (stage === "PROPOSAL") {
    if (status === "DRAFT") return "DRAFT";
    if (status === "SPONSOR_REVIEW") return "AT_SPONSOR_REVIEW";
    if (status === "PGO_FGO_REVIEW") return "AT_PGO_FGO_REVIEW";
    if (status === "SPO_REVIEW") return "AT_SPO_REVIEW";
    if (status === "REJECTED") return "SPO_DECISION_REJECTED";
    return "AT_SPO_REVIEW";
  }

  if (stage === "FUNDING") {
    if (status === "DRAFT") return "FR_DRAFT";
    if (status === "SPONSOR_REVIEW") return "FR_AT_SPONSOR_APPROVALS";
    if (status === "PGO_FGO_REVIEW") return "FR_AT_PGO_FGO_REVIEW";
    if (status === "APPROVED") return "FR_APPROVED";
    if (status === "REJECTED") return "FR_REJECTED";
    return "FR_DRAFT";
  }

  return status === "CHANGE_REVIEW" ? "ARCHIVED" : "CLOSED";
};

export const resolveCanonicalWorkflowState = (
  ctx: WorkflowContext
): { stage: ProjectStage; status: ProjectStatus } => {
  if (ctx.workflow.lifecycleStatus) {
    return mapLifecycleToStageStatus(ctx.workflow.lifecycleStatus);
  }
  const stage = normalizeProjectStage(ctx.stage, ctx.workflow);
  const status = normalizeProjectStatus(ctx.status, stage, ctx.workflow);
  return { stage, status };
};

export const resolveWorkflowLifecycleStatus = (ctx: WorkflowContext): WorkflowLifecycleStatus => {
  const canonical = resolveCanonicalWorkflowState(ctx);
  return lifecycleFromCanonical(canonical.stage, canonical.status);
};

export const mapLifecycleToStageStatus = (
  lifecycleStatus: WorkflowLifecycleStatus
): { stage: ProjectStage; status: ProjectStatus } => {
  switch (lifecycleStatus) {
    case "DRAFT":
      return { stage: "PROPOSAL", status: "DRAFT" };
    case "AT_SPONSOR_REVIEW":
      return { stage: "PROPOSAL", status: "SPONSOR_REVIEW" };
    case "AT_PGO_FGO_REVIEW":
      return { stage: "PROPOSAL", status: "PGO_FGO_REVIEW" };
    case "AT_SPO_REVIEW":
    case "SPO_DECISION_DEFERRED":
      return { stage: "PROPOSAL", status: "SPO_REVIEW" };
    case "SPO_DECISION_REJECTED":
      return { stage: "PROPOSAL", status: "REJECTED" };
    case "SPO_DECISION_APPROVED":
      return { stage: "FUNDING", status: "DRAFT" };
    case "FR_DRAFT":
      return { stage: "FUNDING", status: "DRAFT" };
    case "FR_AT_SPONSOR_APPROVALS":
      return { stage: "FUNDING", status: "SPONSOR_REVIEW" };
    case "FR_AT_PGO_FGO_REVIEW":
      return { stage: "FUNDING", status: "PGO_FGO_REVIEW" };
    case "FR_APPROVED":
      return { stage: "FUNDING", status: "APPROVED" };
    case "FR_REJECTED":
      return { stage: "FUNDING", status: "REJECTED" };
    case "ARCHIVED":
      return { stage: "LIVE", status: "CHANGE_REVIEW" };
    case "CLOSED":
    default:
      return { stage: "LIVE", status: "ACTIVE" };
  }
};

export const getStageDisplayLabel = (stage: ProjectStage): string => {
  if (stage === "PROPOSAL") return "Proposal";
  if (stage === "FUNDING") return "Funding";
  return "Live";
};

export const getStatusDisplayLabel = (status: ProjectStatus): string => {
  if (status === "DRAFT") return "Draft";
  if (status === "SPONSOR_REVIEW") return "Sponsor Review";
  if (status === "PGO_FGO_REVIEW") return "PGO/FGO Review";
  if (status === "SPO_REVIEW") return "SPO Review";
  if (status === "REJECTED") return "Rejected";
  if (status === "APPROVED") return "Approved";
  if (status === "ACTIVE") return "Active";
  return "Change Review";
};

export const deriveWorkflowEntityType = (ctx: Pick<WorkflowContext, "stage" | "workflow">): WorkflowEntityType => {
  if (ctx.workflow.entityType) {
    return ctx.workflow.entityType;
  }
  const stage = normalizeProjectStage(ctx.stage, ctx.workflow);
  return stage === "PROPOSAL" ? "PROPOSAL" : "FUNDING_REQUEST";
};

export const isWorkflowEditableStatus = (
  lifecycleStatus: WorkflowLifecycleStatus,
  stage?: ProjectStage | string
) => {
  if (lifecycleStatus === "DRAFT" || lifecycleStatus === "FR_DRAFT") return true;
  if (stage) {
    const canonical = normalizeProjectStage(stage);
    return canonical !== "LIVE" && mapLifecycleToStageStatus(lifecycleStatus).status === "DRAFT";
  }
  return false;
};

export const isSubmissionLockedForSubmitter = (ctx: WorkflowContext) =>
  !isWorkflowEditableStatus(resolveWorkflowLifecycleStatus(ctx), resolveCanonicalWorkflowState(ctx).stage);

export const isFundingStageSubmission = (
  submission: Pick<ProjectSubmission, "stage" | "status" | "workflow">
) => {
  const stage = resolveCanonicalWorkflowState(submission).stage;
  return stage !== "PROPOSAL";
};

export const getAllowedWorkflowActions = (ctx: WorkflowContext): WorkflowAction[] => {
  const { stage, status } = resolveCanonicalWorkflowState(ctx);
  if (stage === "PROPOSAL" && status === "DRAFT") {
    return ["SEND_TO_SPONSOR"];
  }
  if (stage === "PROPOSAL" && status === "SPO_REVIEW") {
    return ["SPO_APPROVE", "SPO_REJECT"];
  }
  if (stage === "FUNDING" && status === "DRAFT") {
    return ["SUBMIT_FUNDING_REQUEST"];
  }
  if (stage === "LIVE" && status === "ACTIVE") {
    return ["RAISE_CHANGE_REQUEST"];
  }
  return [];
};
