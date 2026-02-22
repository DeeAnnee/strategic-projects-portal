import type { ProjectSubmission } from "@/lib/submissions/types";

export type ChangeRequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "IMPLEMENTED"
  | "CLOSED";

export type ChangeType =
  | "SCOPE_CHANGE"
  | "SCHEDULE_CHANGE"
  | "BUDGET_CHANGE"
  | "BENEFITS_CHANGE"
  | "RESOURCE_CHANGE"
  | "RISK_RECLASSIFICATION"
  | "TECHNICAL_CHANGE"
  | "OTHER";

export type ChangeImpactRiskLevel = "Low" | "Medium" | "High" | "Critical";
export type ChangePriority = "Low" | "Medium" | "High" | "Urgent";
export type ChangeSeverity = "Minor" | "Moderate" | "Major" | "Critical";

export type ChangeApprovalRoleContext =
  | "BUSINESS_SPONSOR"
  | "FINANCE_SPONSOR"
  | "GOVERNANCE_REVIEW"
  | "PM_HUB_ADMIN";

export type ChangeApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type ChangeRequestFieldDelta = {
  id: string;
  changeRequestId: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
};

export type ChangeRequestApproval = {
  id: string;
  changeRequestId: string;
  roleContext: ChangeApprovalRoleContext;
  status: ChangeApprovalStatus;
  approverUserId?: string;
  approverName: string;
  approverEmail: string;
  requestedAt: string;
  decidedAt?: string;
  comment?: string;
  createdAt: string;
  updatedAt: string;
};

export type ChangeRequestComment = {
  id: string;
  changeRequestId: string;
  comment: string;
  authorUserId?: string;
  authorName: string;
  authorEmail?: string;
  createdAt: string;
};

export type ChangeRequestAttachment = {
  id: string;
  changeRequestId: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  uploadedByUserId?: string;
  uploadedByName?: string;
  uploadedAt: string;
};

export type ChangeRequestSnapshot = {
  id: string;
  changeRequestId: string;
  projectId: string;
  snapshotAt: string;
  snapshotByUserId?: string;
  snapshotByName?: string;
  snapshotData: ProjectSubmission;
};

export type ChangeRequestRecord = {
  id: string;
  projectId: string;
  changeType: ChangeType;
  title: string;
  description: string;
  justification: string;
  requestedByUserId?: string;
  requestedByName?: string;
  requestedByEmail?: string;
  createdAt: string;
  updatedAt: string;
  status: ChangeRequestStatus;
  impactScope: string;
  impactScheduleDays: number;
  impactBudgetDelta: number;
  impactBenefitsDelta: number;
  impactRiskLevel: ChangeImpactRiskLevel;
  priority: ChangePriority;
  requiresCommitteeReview: boolean;
  decisionSummary?: string;
  approvedByUserId?: string;
  approvedByName?: string;
  approvedAt?: string;
  implementedAt?: string;
  closedAt?: string;
  projectSnapshotId?: string;
  changeSeverityScore: number;
  changeSeverity: ChangeSeverity;
  projectedCompletionDate?: string;
  budgetVariancePct: number;
  benefitsVariancePct: number;
  healthScoreAdjustment: number;
  slaRiskIndicator: boolean;
};

export type ChangeTemplate = {
  id: string;
  name: string;
  description: string;
  changeType: ChangeType;
  defaultImpactScope: string;
  defaultPriority: ChangePriority;
};

export type ChangeThresholds = {
  budgetImpactThresholdAbs: number;
  budgetImpactThresholdPct: number;
  scheduleImpactThresholdDays: number;
  cumulativeBudgetEscalationPct: number;
};

export type ChangeManagementStore = {
  changeRequests: ChangeRequestRecord[];
  fieldDeltas: ChangeRequestFieldDelta[];
  approvals: ChangeRequestApproval[];
  comments: ChangeRequestComment[];
  attachments: ChangeRequestAttachment[];
  snapshots: ChangeRequestSnapshot[];
  templates: ChangeTemplate[];
  thresholds: ChangeThresholds;
};

export type ProjectChangeIndicator = {
  projectId: string;
  latestChangeStatus: ChangeRequestStatus | "NONE";
  changeRiskIndicator: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "NONE";
  hasOpenChangeRequest: boolean;
  hasBudgetImpact: boolean;
  hasScheduleImpact: boolean;
  hasRiskEscalation: boolean;
  cumulativeBudgetDelta: number;
  cumulativeScheduleImpactDays: number;
};

export type ProjectChangeLogPayload = {
  projectId: string;
  latestChangeStatus: ChangeRequestStatus | "NONE";
  changeRiskIndicator: ProjectChangeIndicator["changeRiskIndicator"];
  openChangeRequests: number;
  cumulativeBudgetDelta: number;
  cumulativeScheduleImpactDays: number;
  averageApprovalTimeHours: number;
  totalChanges: number;
  timeline: Array<{
    changeRequestId: string;
    changeType: ChangeType;
    title: string;
    status: ChangeRequestStatus;
    submittedBy?: string;
    submittedAt: string;
    approvedBy?: string;
    approvedAt?: string;
    implementedAt?: string;
    impactSummary: string;
    severity: ChangeSeverity;
    severityScore: number;
  }>;
  changes: Array<{
    changeRequest: ChangeRequestRecord;
    fieldDeltas: ChangeRequestFieldDelta[];
    approvals: ChangeRequestApproval[];
    comments: ChangeRequestComment[];
    attachments: ChangeRequestAttachment[];
  }>;
};
