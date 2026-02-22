import { randomUUID } from "node:crypto";

import { normalizeRoleType } from "@/lib/auth/roles";
import { listUsers } from "@/lib/auth/users";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";
import { workflowNotificationProvider } from "@/lib/notifications/provider";
import {
  appendChangeRequestApprovals,
  appendChangeRequestAttachment,
  appendChangeRequestComment,
  appendChangeRequestSnapshot,
  createChangeRequestRecord,
  getChangeRequestById,
  getChangeThresholds,
  listChangeTemplates,
  listChangeRequestApprovals,
  listChangeRequestAttachments,
  listChangeRequestComments,
  listChangeRequestDeltas,
  listChangeRequests,
  replaceChangeRequestFieldDeltas,
  updateChangeRequestApproval,
  updateChangeRequestRecord
} from "@/lib/change-management/store";
import type {
  ChangeApprovalRoleContext,
  ChangeManagementStore,
  ChangePriority,
  ChangeRequestApproval,
  ChangeRequestAttachment,
  ChangeRequestComment,
  ChangeRequestFieldDelta,
  ChangeRequestRecord,
  ChangeRequestSnapshot,
  ChangeRequestStatus,
  ChangeSeverity,
  ChangeType,
  ProjectChangeIndicator,
  ProjectChangeLogPayload
} from "@/lib/change-management/types";
import { getSubmissionById, updateSubmission } from "@/lib/submissions/store";
import type { ProjectSubmission, SubmissionPatch } from "@/lib/submissions/types";

type ChangePrincipal = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  roleType?: string | null;
  azureObjectId?: string | null;
};

type ChangeFieldInput = {
  fieldName: string;
  newValue: unknown;
};

type CreateChangeRequestInput = {
  projectId: string;
  changeType: ChangeType;
  title: string;
  description: string;
  justification: string;
  impactScope: string;
  impactScheduleDays: number;
  impactBudgetDelta: number;
  impactBenefitsDelta: number;
  impactRiskLevel: "Low" | "Medium" | "High" | "Critical";
  priority: ChangePriority;
  requiresCommitteeReview?: boolean;
  decisionSummary?: string;
  fieldChanges: ChangeFieldInput[];
  comments?: Array<{ comment: string }>;
  attachments?: Array<{ fileName: string; fileUrl: string; mimeType?: string }>;
};

type ChangeRequestDetails = {
  changeRequest: ChangeRequestRecord;
  deltas: ChangeRequestFieldDelta[];
  approvals: ChangeRequestApproval[];
  comments: ChangeRequestComment[];
  attachments: ChangeRequestAttachment[];
};

const allowedFieldPaths = new Set<string>([
  "title",
  "summary",
  "priority",
  "riskLevel",
  "segmentUnit",
  "projectTheme",
  "strategicObjective",
  "specificClassificationType",
  "projectClassification",
  "projectType",
  "enterpriseProjectTheme",
  "portfolioEsc",
  "startDate",
  "endDate",
  "targetGoLive",
  "financials.capex",
  "financials.opex",
  "financials.oneTimeCosts",
  "financials.runRateSavings",
  "benefits.costSaveEst",
  "benefits.revenueUpliftEst",
  "benefits.qualitativeBenefits",
  "businessCase.scopeSchedule.goLive",
  "businessCase.scopeSchedule.benefitRealizationStart"
]);

const openChangeStatuses: ChangeRequestStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "IMPLEMENTED"
];

const normalizeEmail = (value?: string | null) => (value ?? "").trim().toLowerCase();
const nowIso = () => new Date().toISOString();

const toTitleCaseRisk = (value: string): "Low" | "Medium" | "High" | "Critical" => {
  const lowered = value.toLowerCase();
  if (lowered === "critical") return "Critical";
  if (lowered === "high") return "High";
  if (lowered === "medium") return "Medium";
  return "Low";
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

const getPathValue = (source: unknown, path: string): unknown => {
  const segments = path.split(".").filter(Boolean);
  let current: unknown = source;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in (current as Record<string, unknown>))) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const setPathValue = (target: Record<string, unknown>, path: string, value: unknown) => {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return;
  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index] as string;
    const next = cursor[key];
    if (!next || typeof next !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1] as string] = value;
};

const coerceNewValue = (oldValue: unknown, nextValue: unknown): unknown => {
  if (typeof oldValue === "number") {
    const parsed = Number(nextValue);
    return Number.isFinite(parsed) ? parsed : oldValue;
  }
  if (typeof oldValue === "boolean") {
    if (typeof nextValue === "boolean") return nextValue;
    if (typeof nextValue === "string") return nextValue.trim().toLowerCase() === "true";
    return Boolean(nextValue);
  }
  if (typeof oldValue === "string") {
    return typeof nextValue === "string" ? nextValue : String(nextValue ?? "");
  }
  return nextValue;
};

export const isSubmissionEligibleForChangeManagement = (submission: ProjectSubmission) => {
  const normalizedStatus = (submission.status ?? "").trim().toUpperCase();
  const normalizedStage = (submission.stage ?? "").trim().toUpperCase();
  const normalizedFunding = (submission.workflow?.fundingStatus ?? "").trim().toUpperCase();
  return (
    normalizedStatus === "APPROVED" ||
    normalizedStage === "DELIVERY" ||
    normalizedStage === "LIVE PROJECT" ||
    normalizedFunding === "LIVE"
  );
};

const isAssignedProjectManager = (principal: ChangePrincipal, submission: ProjectSubmission) => {
  const principalEmail = normalizeEmail(principal.email);
  if (!principalEmail) {
    return false;
  }
  if (normalizeEmail(submission.ownerEmail) === principalEmail) {
    return true;
  }
  return (submission.assignments ?? []).some((assignment) => {
    const assignmentType = (assignment.assignmentType ?? "").toLowerCase();
    const isPmAssignment =
      assignmentType.includes("pm") || assignmentType.includes("project manager");
    return isPmAssignment && normalizeEmail(assignment.userEmail) === principalEmail;
  });
};

export const canInitiateChangeRequest = (principal: ChangePrincipal, submission: ProjectSubmission) => {
  if (!isSubmissionEligibleForChangeManagement(submission)) {
    return false;
  }
  const role = normalizeRoleType(principal.roleType);
  if (role === "ADMIN" || role === "PROJECT_MANAGEMENT_HUB_ADMIN") {
    return true;
  }
  if (role === "PROJECT_MANAGEMENT_HUB_BASIC_USER") {
    return isAssignedProjectManager(principal, submission);
  }
  return false;
};

const severityFromScore = (score: number): ChangeSeverity => {
  if (score >= 75) return "Critical";
  if (score >= 55) return "Major";
  if (score >= 30) return "Moderate";
  return "Minor";
};

const addDaysIso = (isoDate?: string, days = 0) => {
  if (!isoDate) return undefined;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return undefined;
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const computeImpact = (
  submission: ProjectSubmission,
  input: Pick<
    CreateChangeRequestInput,
    "changeType" | "impactScope" | "impactScheduleDays" | "impactBudgetDelta" | "impactBenefitsDelta" | "impactRiskLevel"
  >
) => {
  const baselineBudget = Math.max(
    0,
    Number(submission.financials.capex + submission.financials.opex + submission.financials.oneTimeCosts)
  );
  const baselineBenefits = Math.max(
    0,
    Number(submission.benefits.costSaveEst + submission.benefits.revenueUpliftEst)
  );
  const budgetVariancePct =
    baselineBudget > 0 ? round2((input.impactBudgetDelta / baselineBudget) * 100) : 0;
  const benefitsVariancePct =
    baselineBenefits > 0 ? round2((input.impactBenefitsDelta / baselineBenefits) * 100) : 0;

  const riskScoreMap: Record<"Low" | "Medium" | "High" | "Critical", number> = {
    Low: 6,
    Medium: 13,
    High: 21,
    Critical: 30
  };

  const scopeFactor =
    input.changeType === "SCOPE_CHANGE"
      ? 18
      : input.impactScope.trim().length > 120
        ? 12
        : 6;
  const scheduleFactor = clamp(Math.abs(input.impactScheduleDays) * 0.9, 0, 28);
  const budgetFactor = clamp(Math.abs(budgetVariancePct) * 1.6, 0, 34);
  const score = round2(clamp(scopeFactor + scheduleFactor + budgetFactor + riskScoreMap[input.impactRiskLevel], 0, 100));
  const severity = severityFromScore(score);
  const projectedCompletionDate = addDaysIso(submission.endDate, input.impactScheduleDays);
  const healthScoreAdjustment = round2(clamp(score / 8, 0, 12));
  const slaRiskIndicator = Math.abs(input.impactScheduleDays) >= 14 || severity === "Major" || severity === "Critical";

  return {
    budgetVariancePct,
    benefitsVariancePct,
    score,
    severity,
    projectedCompletionDate,
    healthScoreAdjustment,
    slaRiskIndicator
  };
};

const isSignificantScopeChange = (input: CreateChangeRequestInput) => {
  if (input.changeType === "SCOPE_CHANGE") return true;
  const signalText = `${input.title} ${input.description} ${input.impactScope}`.toLowerCase();
  return ["scope", "major", "enterprise", "regulatory", "critical"].some((token) =>
    signalText.includes(token)
  );
};

const resolveBusinessSponsor = (submission: ProjectSubmission) => {
  const ref = submission.sponsorContacts?.businessSponsor;
  const name = ref?.displayName || submission.businessSponsor || submission.sponsorName || "";
  const email = normalizeEmail(ref?.email || submission.sponsorEmail);
  return name || email
    ? {
        roleContext: "BUSINESS_SPONSOR" as const,
        approverName: name || email,
        approverEmail: email
      }
    : null;
};

const resolveFinanceSponsor = (submission: ProjectSubmission) => {
  const ref = submission.sponsorContacts?.financeSponsor;
  const name = ref?.displayName || submission.financeSponsor || "";
  const email = normalizeEmail(ref?.email);
  return name || email
    ? {
        roleContext: "FINANCE_SPONSOR" as const,
        approverName: name || email,
        approverEmail: email
      }
    : null;
};

const dedupeByEmail = <T extends { approverEmail: string }>(rows: T[]) => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const email = normalizeEmail(row.approverEmail);
    if (!email || seen.has(email)) {
      return false;
    }
    seen.add(email);
    return true;
  });
};

const resolveRoleBasedApprover = async (
  roles: Array<"PROJECT_GOVERNANCE_USER" | "FINANCE_GOVERNANCE_USER" | "PROJECT_MANAGEMENT_HUB_ADMIN" | "ADMIN">,
  roleContext: ChangeApprovalRoleContext
) => {
  const users = await listUsers();
  const match = users
    .filter((user) => user.isActive)
    .find((user) => roles.includes(user.roleType as (typeof roles)[number]));
  if (!match) {
    return null;
  }
  return {
    roleContext,
    approverUserId: match.id,
    approverName: match.name,
    approverEmail: normalizeEmail(match.email)
  };
};

const resolveRequiredApprovers = async (
  submission: ProjectSubmission,
  changeRequest: ChangeRequestRecord
) => {
  const thresholds = await getChangeThresholds();
  const contexts = new Set<ChangeApprovalRoleContext>();

  const requiresFinance =
    Math.abs(changeRequest.impactBudgetDelta) >= thresholds.budgetImpactThresholdAbs ||
    Math.abs(changeRequest.budgetVariancePct) >= thresholds.budgetImpactThresholdPct;
  const requiresGovernance =
    Math.abs(changeRequest.impactScheduleDays) >= thresholds.scheduleImpactThresholdDays;
  const requiresSponsor = isSignificantScopeChange({
    projectId: submission.id,
    changeType: changeRequest.changeType,
    title: changeRequest.title,
    description: changeRequest.description,
    justification: changeRequest.justification,
    impactScope: changeRequest.impactScope,
    impactScheduleDays: changeRequest.impactScheduleDays,
    impactBudgetDelta: changeRequest.impactBudgetDelta,
    impactBenefitsDelta: changeRequest.impactBenefitsDelta,
    impactRiskLevel: changeRequest.impactRiskLevel,
    priority: changeRequest.priority,
    fieldChanges: []
  });

  if (changeRequest.requiresCommitteeReview) {
    contexts.add("BUSINESS_SPONSOR");
    contexts.add("FINANCE_SPONSOR");
    contexts.add("GOVERNANCE_REVIEW");
  } else {
    if (requiresFinance) contexts.add("FINANCE_SPONSOR");
    if (requiresGovernance) contexts.add("GOVERNANCE_REVIEW");
    if (requiresSponsor) contexts.add("BUSINESS_SPONSOR");
  }

  if (contexts.size === 0) {
    contexts.add("PM_HUB_ADMIN");
  }

  const approvers: Array<{
    roleContext: ChangeApprovalRoleContext;
    approverUserId?: string;
    approverName: string;
    approverEmail: string;
  }> = [];

  if (contexts.has("BUSINESS_SPONSOR")) {
    const sponsor = resolveBusinessSponsor(submission);
    if (sponsor?.approverEmail) {
      approvers.push(sponsor);
    }
  }

  if (contexts.has("FINANCE_SPONSOR")) {
    const financeSponsor = resolveFinanceSponsor(submission);
    if (financeSponsor?.approverEmail) {
      approvers.push(financeSponsor);
    } else {
      const fallback = await resolveRoleBasedApprover(
        ["FINANCE_GOVERNANCE_USER", "ADMIN"],
        "FINANCE_SPONSOR"
      );
      if (fallback) {
        approvers.push(fallback);
      }
    }
  }

  if (contexts.has("GOVERNANCE_REVIEW")) {
    const governanceApprover = await resolveRoleBasedApprover(
      ["PROJECT_GOVERNANCE_USER", "FINANCE_GOVERNANCE_USER", "ADMIN"],
      "GOVERNANCE_REVIEW"
    );
    if (governanceApprover) {
      approvers.push(governanceApprover);
    }
  }

  if (contexts.has("PM_HUB_ADMIN")) {
    const pmApprover = await resolveRoleBasedApprover(
      ["PROJECT_MANAGEMENT_HUB_ADMIN", "ADMIN"],
      "PM_HUB_ADMIN"
    );
    if (pmApprover) {
      approvers.push(pmApprover);
    }
  }

  return dedupeByEmail(approvers);
};

const buildApprovalRows = (
  changeRequestId: string,
  approvers: Array<{
    roleContext: ChangeApprovalRoleContext;
    approverUserId?: string;
    approverName: string;
    approverEmail: string;
  }>
): ChangeRequestApproval[] => {
  const timestamp = nowIso();
  return approvers.map((approver) => ({
    id: `cr-approval-${Date.now()}-${Math.floor(Math.random() * 10_000)}`,
    changeRequestId,
    roleContext: approver.roleContext,
    status: "PENDING",
    approverUserId: approver.approverUserId,
    approverName: approver.approverName,
    approverEmail: approver.approverEmail,
    requestedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  }));
};

const notifyRecipient = async (toEmail: string, title: string, body: string, href: string) => {
  await workflowNotificationProvider.sendInApp({ toEmail, title, body, href });
  await workflowNotificationProvider.sendOutlook({ toEmail, title, body, href });
  await workflowNotificationProvider.sendTeams({ toEmail, title, body, href });
};

const collectStakeholderEmails = (submission: ProjectSubmission) => {
  const emails = new Set<string>();
  const add = (value?: string | null) => {
    const normalized = normalizeEmail(value);
    if (normalized) emails.add(normalized);
  };
  add(submission.ownerEmail);
  add(submission.sponsorEmail);
  add(submission.sponsorContacts?.businessSponsor?.email);
  add(submission.sponsorContacts?.businessDelegate?.email);
  add(submission.sponsorContacts?.financeSponsor?.email);
  add(submission.sponsorContacts?.technologySponsor?.email);
  add(submission.sponsorContacts?.benefitsSponsor?.email);
  return Array.from(emails);
};

const summarizeImpact = (change: ChangeRequestRecord) =>
  `Schedule ${change.impactScheduleDays >= 0 ? "+" : ""}${change.impactScheduleDays}d, budget ${
    change.impactBudgetDelta >= 0 ? "+" : ""
  }${change.impactBudgetDelta.toLocaleString("en-US", { maximumFractionDigits: 0 })}, benefits ${
    change.impactBenefitsDelta >= 0 ? "+" : ""
  }${change.impactBenefitsDelta.toLocaleString("en-US", { maximumFractionDigits: 0 })}.`;

const assertAllowedField = (fieldName: string) => {
  if (!allowedFieldPaths.has(fieldName)) {
    throw new Error(`Field ${fieldName} is not permitted for change control updates.`);
  }
};

const roleCanImplement = (principal: ChangePrincipal, submission: ProjectSubmission) => {
  const role = normalizeRoleType(principal.roleType);
  if (role === "ADMIN" || role === "PROJECT_MANAGEMENT_HUB_ADMIN") {
    return true;
  }
  if (role === "PROJECT_MANAGEMENT_HUB_BASIC_USER") {
    return isAssignedProjectManager(principal, submission);
  }
  return false;
};

const projectCreatedBy = (submission: ProjectSubmission) =>
  submission.ownerName || submission.createdByUserId || "Project Submitter";

export const createChangeRequestDraft = async (
  principal: ChangePrincipal,
  input: CreateChangeRequestInput
): Promise<ChangeRequestDetails> => {
  const submission = await getSubmissionById(input.projectId);
  if (!submission) {
    throw new Error("Project not found.");
  }
  if (!canInitiateChangeRequest(principal, submission)) {
    throw new Error("You are not allowed to initiate change requests for this project.");
  }

  const createdAt = nowIso();
  const impact = computeImpact(submission, input);
  const id = `CR-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;

  const deltas: ChangeRequestFieldDelta[] = input.fieldChanges.map((change) => {
    assertAllowedField(change.fieldName);
    const oldValue = getPathValue(submission, change.fieldName);
    const newValue = coerceNewValue(oldValue, change.newValue);
    return {
      id: `cr-delta-${Date.now()}-${Math.floor(Math.random() * 10_000)}`,
      changeRequestId: id,
      fieldName: change.fieldName,
      oldValue,
      newValue,
      createdAt
    };
  });

  const snapshot: ChangeRequestSnapshot = {
    id: `cr-snapshot-${randomUUID()}`,
    changeRequestId: id,
    projectId: submission.id,
    snapshotAt: createdAt,
    snapshotByUserId: principal.id ?? undefined,
    snapshotByName: principal.name ?? undefined,
    snapshotData: submission
  };

  const record: ChangeRequestRecord = {
    id,
    projectId: input.projectId,
    changeType: input.changeType,
    title: input.title.trim(),
    description: input.description.trim(),
    justification: input.justification.trim(),
    requestedByUserId: principal.id ?? undefined,
    requestedByName: principal.name ?? undefined,
    requestedByEmail: normalizeEmail(principal.email),
    createdAt,
    updatedAt: createdAt,
    status: "DRAFT",
    impactScope: input.impactScope.trim(),
    impactScheduleDays: Math.trunc(input.impactScheduleDays),
    impactBudgetDelta: round2(input.impactBudgetDelta),
    impactBenefitsDelta: round2(input.impactBenefitsDelta),
    impactRiskLevel: toTitleCaseRisk(input.impactRiskLevel),
    priority: input.priority,
    requiresCommitteeReview: Boolean(input.requiresCommitteeReview),
    decisionSummary: input.decisionSummary?.trim() || undefined,
    projectSnapshotId: snapshot.id,
    changeSeverityScore: impact.score,
    changeSeverity: impact.severity,
    projectedCompletionDate: impact.projectedCompletionDate,
    budgetVariancePct: impact.budgetVariancePct,
    benefitsVariancePct: impact.benefitsVariancePct,
    healthScoreAdjustment: impact.healthScoreAdjustment,
    slaRiskIndicator: impact.slaRiskIndicator
  };

  await createChangeRequestRecord(record);
  await replaceChangeRequestFieldDeltas(id, deltas);
  await appendChangeRequestSnapshot(snapshot);

  for (const commentRow of input.comments ?? []) {
    const trimmed = commentRow.comment?.trim();
    if (!trimmed) continue;
    await appendChangeRequestComment({
      id: `cr-comment-${Date.now()}-${Math.floor(Math.random() * 10_000)}`,
      changeRequestId: id,
      comment: trimmed,
      authorUserId: principal.id ?? undefined,
      authorName: principal.name ?? "Project Manager",
      authorEmail: normalizeEmail(principal.email) || undefined,
      createdAt
    });
  }

  for (const attachment of input.attachments ?? []) {
    if (!attachment.fileName || !attachment.fileUrl) continue;
    await appendChangeRequestAttachment({
      id: `cr-attach-${Date.now()}-${Math.floor(Math.random() * 10_000)}`,
      changeRequestId: id,
      fileName: attachment.fileName.trim(),
      fileUrl: attachment.fileUrl.trim(),
      mimeType: attachment.mimeType?.trim() || undefined,
      uploadedByUserId: principal.id ?? undefined,
      uploadedByName: principal.name ?? "Project Manager",
      uploadedAt: createdAt
    });
  }

  await appendGovernanceAuditLog({
    area: "WORKFLOW",
    action: "CREATE_CHANGE_REQUEST_DRAFT",
    entityType: "change_request",
    entityId: id,
    outcome: "SUCCESS",
    actorName: principal.name ?? "PM User",
    actorEmail: normalizeEmail(principal.email) || undefined,
    actorRole: principal.roleType ?? undefined,
    details: `Change Request draft created for ${submission.id}.`,
    metadata: {
      projectId: submission.id,
      changeType: record.changeType,
      severity: record.changeSeverity,
      severityScore: record.changeSeverityScore
    }
  });

  return {
    changeRequest: record,
    deltas,
    approvals: [],
    comments: await listChangeRequestComments(id),
    attachments: await listChangeRequestAttachments(id)
  };
};

const loadChangeRequestDetails = async (id: string): Promise<ChangeRequestDetails | null> => {
  const row = await getChangeRequestById(id);
  if (!row) return null;
  const [deltas, approvals, comments, attachments] = await Promise.all([
    listChangeRequestDeltas(id),
    listChangeRequestApprovals(id),
    listChangeRequestComments(id),
    listChangeRequestAttachments(id)
  ]);
  return {
    changeRequest: row,
    deltas,
    approvals,
    comments,
    attachments
  };
};

const summarizeApprovalState = (approvals: ChangeRequestApproval[]) => {
  const byContext = new Map<ChangeApprovalRoleContext, ChangeRequestApproval[]>();
  approvals.forEach((approval) => {
    const current = byContext.get(approval.roleContext) ?? [];
    current.push(approval);
    byContext.set(approval.roleContext, current);
  });

  const contexts = Array.from(byContext.keys());
  const anyRejected = contexts.some((context) =>
    (byContext.get(context) ?? []).some((row) => row.status === "REJECTED")
  );
  const allApproved =
    contexts.length > 0 &&
    contexts.every((context) => (byContext.get(context) ?? []).some((row) => row.status === "APPROVED"));
  const pendingCount = approvals.filter((row) => row.status === "PENDING").length;

  return {
    anyRejected,
    allApproved,
    pendingCount
  };
};

const matchesPrincipal = (approval: ChangeRequestApproval, principal: ChangePrincipal) => {
  const principalEmail = normalizeEmail(principal.email);
  if (principalEmail && normalizeEmail(approval.approverEmail) === principalEmail) {
    return true;
  }
  if (principal.id && approval.approverUserId && principal.id === approval.approverUserId) {
    return true;
  }
  return false;
};

export const submitChangeRequest = async (
  id: string,
  principal: ChangePrincipal
): Promise<ChangeRequestDetails> => {
  const details = await loadChangeRequestDetails(id);
  if (!details) {
    throw new Error("Change Request not found.");
  }
  if (details.changeRequest.status !== "DRAFT") {
    throw new Error("Only draft Change Requests can be submitted.");
  }

  const submission = await getSubmissionById(details.changeRequest.projectId);
  if (!submission) {
    throw new Error("Project not found.");
  }
  if (!canInitiateChangeRequest(principal, submission)) {
    throw new Error("You are not allowed to submit this Change Request.");
  }

  const approvers = await resolveRequiredApprovers(submission, details.changeRequest);
  if (approvers.length === 0) {
    throw new Error("No approvers could be resolved for this Change Request.");
  }

  const approvalRows = buildApprovalRows(id, approvers);
  await appendChangeRequestApprovals(approvalRows);
  const next = await updateChangeRequestRecord(id, {
    status: "SUBMITTED",
    updatedAt: nowIso()
  });
  if (!next) {
    throw new Error("Unable to submit Change Request.");
  }

  const href = `/project-management-hub?changeRequest=${encodeURIComponent(id)}`;
  for (const approval of approvalRows) {
    await notifyRecipient(
      approval.approverEmail,
      `${id} requires change approval`,
      `${submission.id} (${submission.title}) has a pending change requiring your review as ${approval.roleContext}.`,
      href
    );
  }

  await appendGovernanceAuditLog({
    area: "WORKFLOW",
    action: "SUBMIT_CHANGE_REQUEST",
    entityType: "change_request",
    entityId: id,
    outcome: "SUCCESS",
    actorName: principal.name ?? "PM User",
    actorEmail: normalizeEmail(principal.email) || undefined,
    actorRole: principal.roleType ?? undefined,
    details: `Submitted change request for project ${submission.id}.`,
    metadata: {
      projectId: submission.id,
      approvers: approvalRows.length
    }
  });

  return {
    changeRequest: next,
    deltas: details.deltas,
    approvals: approvalRows,
    comments: details.comments,
    attachments: details.attachments
  };
};

const decideChangeRequest = async (
  id: string,
  principal: ChangePrincipal,
  decision: "APPROVED" | "REJECTED",
  comment?: string
): Promise<ChangeRequestDetails> => {
  const details = await loadChangeRequestDetails(id);
  if (!details) {
    throw new Error("Change Request not found.");
  }
  if (!["SUBMITTED", "UNDER_REVIEW"].includes(details.changeRequest.status)) {
    throw new Error("Change Request is not in review.");
  }

  const submission = await getSubmissionById(details.changeRequest.projectId);
  if (!submission) {
    throw new Error("Project not found.");
  }

  const role = normalizeRoleType(principal.roleType);
  const candidate = details.approvals.find(
    (approval) => approval.status === "PENDING" && matchesPrincipal(approval, principal)
  );

  if (!candidate && role !== "ADMIN") {
    throw new Error("No pending approval assignment found for this user.");
  }

  const targetApproval = candidate ?? details.approvals.find((approval) => approval.status === "PENDING");
  if (!targetApproval) {
    throw new Error("No pending approvals remain for this Change Request.");
  }

  const updatedApproval = await updateChangeRequestApproval(targetApproval.id, {
    status: decision,
    comment: comment?.trim() || undefined,
    decidedAt: nowIso()
  });
  if (!updatedApproval) {
    throw new Error("Unable to update approval decision.");
  }

  if (decision === "REJECTED") {
    for (const sibling of details.approvals) {
      if (sibling.id === updatedApproval.id || sibling.status !== "PENDING") continue;
      await updateChangeRequestApproval(sibling.id, {
        status: "CANCELLED",
        decidedAt: nowIso(),
        comment: "Cancelled after rejection."
      });
    }
  }

  const approvals = await listChangeRequestApprovals(id);
  const summary = summarizeApprovalState(approvals);

  let nextStatus: ChangeRequestStatus = "UNDER_REVIEW";
  if (summary.anyRejected) {
    nextStatus = "REJECTED";
  } else if (summary.allApproved) {
    nextStatus = "APPROVED";
  }

  const next = await updateChangeRequestRecord(id, {
    status: nextStatus,
    approvedByUserId: nextStatus === "APPROVED" ? principal.id ?? undefined : details.changeRequest.approvedByUserId,
    approvedByName: nextStatus === "APPROVED" ? principal.name ?? undefined : details.changeRequest.approvedByName,
    approvedAt: nextStatus === "APPROVED" ? nowIso() : details.changeRequest.approvedAt,
    decisionSummary:
      nextStatus === "REJECTED"
        ? comment?.trim() || "Rejected during change governance review."
        : details.changeRequest.decisionSummary
  });
  if (!next) {
    throw new Error("Unable to persist Change Request decision.");
  }

  const href = `/project-management-hub?changeRequest=${encodeURIComponent(id)}`;
  const notifyEmails = collectStakeholderEmails(submission);
  const verb = decision === "APPROVED" ? "approved" : "rejected";
  for (const email of notifyEmails) {
    await notifyRecipient(
      email,
      `${id} ${verb}`,
      `Change Request ${id} for ${submission.id} was ${verb}. Current status: ${next.status}.`,
      href
    );
  }

  await appendGovernanceAuditLog({
    area: "WORKFLOW",
    action: decision === "APPROVED" ? "APPROVE_CHANGE_REQUEST" : "REJECT_CHANGE_REQUEST",
    entityType: "change_request",
    entityId: id,
    outcome: "SUCCESS",
    actorName: principal.name ?? "Approver",
    actorEmail: normalizeEmail(principal.email) || undefined,
    actorRole: principal.roleType ?? undefined,
    details: `${decision} decision recorded.`,
    metadata: {
      projectId: submission.id,
      status: next.status
    }
  });

  return {
    changeRequest: next,
    deltas: details.deltas,
    approvals,
    comments: details.comments,
    attachments: details.attachments
  };
};

export const approveChangeRequest = async (id: string, principal: ChangePrincipal, comment?: string) =>
  decideChangeRequest(id, principal, "APPROVED", comment);

export const rejectChangeRequest = async (id: string, principal: ChangePrincipal, comment: string) =>
  decideChangeRequest(id, principal, "REJECTED", comment);

export const implementChangeRequest = async (
  id: string,
  principal: ChangePrincipal,
  options?: { closeAfterImplement?: boolean }
): Promise<ChangeRequestDetails> => {
  const details = await loadChangeRequestDetails(id);
  if (!details) {
    throw new Error("Change Request not found.");
  }
  if (details.changeRequest.status !== "APPROVED") {
    throw new Error("Only approved Change Requests can be implemented.");
  }

  const submission = await getSubmissionById(details.changeRequest.projectId);
  if (!submission) {
    throw new Error("Project not found.");
  }
  if (!roleCanImplement(principal, submission)) {
    throw new Error("You are not allowed to implement this Change Request.");
  }

  const patch: Record<string, unknown> = {};
  for (const delta of details.deltas) {
    assertAllowedField(delta.fieldName);
    setPathValue(patch, delta.fieldName, delta.newValue);
  }

  const updatedSubmission = await updateSubmission(submission.id, patch as SubmissionPatch, {
    audit: {
      action: "UPDATED",
      note: `Applied Change Request ${id} to approved project.`,
      actorName: principal.name ?? "PM User",
      actorEmail: normalizeEmail(principal.email) || undefined
    }
  });
  if (!updatedSubmission) {
    throw new Error("Unable to update project with approved change.");
  }

  const implementedAt = nowIso();
  const nextStatus: ChangeRequestStatus = options?.closeAfterImplement ? "CLOSED" : "IMPLEMENTED";
  const next = await updateChangeRequestRecord(id, {
    status: nextStatus,
    implementedAt,
    closedAt: options?.closeAfterImplement ? implementedAt : details.changeRequest.closedAt,
    updatedAt: implementedAt
  });
  if (!next) {
    throw new Error("Unable to update Change Request status.");
  }

  const href = `/project-management-hub?projectId=${encodeURIComponent(submission.id)}`;
  for (const email of collectStakeholderEmails(updatedSubmission)) {
    await notifyRecipient(
      email,
      `${id} implemented`,
      `Approved changes have been implemented on ${submission.id}. ${summarizeImpact(next)}`,
      href
    );
  }

  await appendGovernanceAuditLog({
    area: "WORKFLOW",
    action: "IMPLEMENT_CHANGE_REQUEST",
    entityType: "change_request",
    entityId: id,
    outcome: "SUCCESS",
    actorName: principal.name ?? "PM User",
    actorEmail: normalizeEmail(principal.email) || undefined,
    actorRole: principal.roleType ?? undefined,
    details: `Applied change request to project ${submission.id}.`,
    metadata: {
      projectId: submission.id,
      implementedStatus: next.status,
      budgetDelta: next.impactBudgetDelta,
      scheduleDeltaDays: next.impactScheduleDays
    }
  });

  return {
    changeRequest: next,
    deltas: details.deltas,
    approvals: details.approvals,
    comments: details.comments,
    attachments: details.attachments
  };
};

export const addChangeRequestComment = async (
  changeRequestId: string,
  principal: ChangePrincipal,
  comment: string
) => {
  const trimmed = comment.trim();
  if (!trimmed) {
    throw new Error("Comment is required.");
  }
  const row: ChangeRequestComment = {
    id: `cr-comment-${Date.now()}-${Math.floor(Math.random() * 10_000)}`,
    changeRequestId,
    comment: trimmed,
    authorUserId: principal.id ?? undefined,
    authorName: principal.name ?? "Portal User",
    authorEmail: normalizeEmail(principal.email) || undefined,
    createdAt: nowIso()
  };
  await appendChangeRequestComment(row);
  return row;
};

export const addChangeRequestAttachment = async (
  changeRequestId: string,
  principal: ChangePrincipal,
  attachment: { fileName: string; fileUrl: string; mimeType?: string }
) => {
  if (!attachment.fileName?.trim() || !attachment.fileUrl?.trim()) {
    throw new Error("Attachment file name and URL are required.");
  }
  const row: ChangeRequestAttachment = {
    id: `cr-attach-${Date.now()}-${Math.floor(Math.random() * 10_000)}`,
    changeRequestId,
    fileName: attachment.fileName.trim(),
    fileUrl: attachment.fileUrl.trim(),
    mimeType: attachment.mimeType?.trim() || undefined,
    uploadedByUserId: principal.id ?? undefined,
    uploadedByName: principal.name ?? "Portal User",
    uploadedAt: nowIso()
  };
  await appendChangeRequestAttachment(row);
  return row;
};

export const getChangeRequestDetails = async (id: string) => {
  const details = await loadChangeRequestDetails(id);
  if (!details) {
    return null;
  }
  return details;
};

const getChangeRiskIndicator = (changes: ChangeRequestRecord[]): ProjectChangeIndicator["changeRiskIndicator"] => {
  if (changes.length === 0) {
    return "NONE";
  }
  const open = changes.filter((row) => openChangeStatuses.includes(row.status));
  const source = open.length > 0 ? open : changes;
  if (source.some((row) => row.changeSeverity === "Critical")) return "CRITICAL";
  if (source.some((row) => row.changeSeverity === "Major" || row.impactRiskLevel === "High")) return "HIGH";
  if (source.some((row) => row.changeSeverity === "Moderate" || row.impactRiskLevel === "Medium")) return "MEDIUM";
  return "LOW";
};

export const getProjectChangeIndicator = async (projectId: string): Promise<ProjectChangeIndicator> => {
  const changes = await listChangeRequests(projectId);
  const [thresholds, submission] = await Promise.all([getChangeThresholds(), getSubmissionById(projectId)]);
  const latest = changes[0];
  const active = changes.filter((row) => openChangeStatuses.includes(row.status));
  const cumulativeBudgetDelta = round2(
    changes
      .filter((row) => row.status !== "REJECTED")
      .reduce((sum, row) => sum + row.impactBudgetDelta, 0)
  );
  const cumulativeScheduleImpactDays = Math.round(
    changes
      .filter((row) => row.status !== "REJECTED")
      .reduce((sum, row) => sum + row.impactScheduleDays, 0)
  );
  const baselineBudget = submission
    ? Math.max(0, Number(submission.financials.capex + submission.financials.opex + submission.financials.oneTimeCosts))
    : 0;
  const cumulativeBudgetPct =
    baselineBudget > 0 ? Math.abs((cumulativeBudgetDelta / baselineBudget) * 100) : 0;

  return {
    projectId,
    latestChangeStatus: latest?.status ?? "NONE",
    changeRiskIndicator: getChangeRiskIndicator(changes),
    hasOpenChangeRequest: active.length > 0,
    hasBudgetImpact: active.some((row) => row.impactBudgetDelta !== 0),
    hasScheduleImpact: active.some((row) => row.impactScheduleDays !== 0),
    hasRiskEscalation: active.some(
      (row) => row.impactRiskLevel === "High" || row.impactRiskLevel === "Critical" || row.changeSeverity === "Critical"
    ) || cumulativeBudgetPct >= thresholds.cumulativeBudgetEscalationPct,
    cumulativeBudgetDelta,
    cumulativeScheduleImpactDays
  };
};

const averageApprovalHours = (approvals: ChangeRequestApproval[]) => {
  const decided = approvals.filter((row) => row.decidedAt && row.status === "APPROVED");
  if (decided.length === 0) return 0;
  const total = decided.reduce((sum, row) => {
    const requestedMs = new Date(row.requestedAt).getTime();
    const decidedMs = new Date(row.decidedAt ?? row.requestedAt).getTime();
    if (Number.isNaN(requestedMs) || Number.isNaN(decidedMs)) return sum;
    return sum + (decidedMs - requestedMs) / 3_600_000;
  }, 0);
  return round2(total / decided.length);
};

export const getProjectChangeLog = async (projectId: string): Promise<ProjectChangeLogPayload> => {
  const changes = await listChangeRequests(projectId);
  const details = await Promise.all(
    changes.map(async (changeRequest) => {
      const [fieldDeltas, approvals, comments, attachments] = await Promise.all([
        listChangeRequestDeltas(changeRequest.id),
        listChangeRequestApprovals(changeRequest.id),
        listChangeRequestComments(changeRequest.id),
        listChangeRequestAttachments(changeRequest.id)
      ]);
      return { changeRequest, fieldDeltas, approvals, comments, attachments };
    })
  );

  const latest = changes[0];
  const openCount = changes.filter((row) => openChangeStatuses.includes(row.status)).length;
  const cumulativeBudgetDelta = round2(
    changes
      .filter((row) => row.status !== "REJECTED")
      .reduce((sum, row) => sum + row.impactBudgetDelta, 0)
  );
  const cumulativeScheduleImpactDays = Math.round(
    changes
      .filter((row) => row.status !== "REJECTED")
      .reduce((sum, row) => sum + row.impactScheduleDays, 0)
  );
  const averageApprovalTimeHours = round2(
    details.reduce((sum, row) => sum + averageApprovalHours(row.approvals), 0) / Math.max(1, details.length)
  );

  return {
    projectId,
    latestChangeStatus: latest?.status ?? "NONE",
    changeRiskIndicator: getChangeRiskIndicator(changes),
    openChangeRequests: openCount,
    cumulativeBudgetDelta,
    cumulativeScheduleImpactDays,
    averageApprovalTimeHours,
    totalChanges: changes.length,
    timeline: changes.map((row) => ({
      changeRequestId: row.id,
      changeType: row.changeType,
      title: row.title,
      status: row.status,
      submittedBy: row.requestedByName || row.requestedByEmail || undefined,
      submittedAt: row.createdAt,
      approvedBy: row.approvedByName || undefined,
      approvedAt: row.approvedAt,
      implementedAt: row.implementedAt,
      impactSummary: summarizeImpact(row),
      severity: row.changeSeverity,
      severityScore: row.changeSeverityScore
    })),
    changes: details
  };
};

export const listChangeRequestsWithDetails = async (projectId?: string): Promise<ChangeRequestDetails[]> => {
  const requests = await listChangeRequests(projectId);
  return Promise.all(
    requests.map(async (changeRequest) => ({
      changeRequest,
      deltas: await listChangeRequestDeltas(changeRequest.id),
      approvals: await listChangeRequestApprovals(changeRequest.id),
      comments: await listChangeRequestComments(changeRequest.id),
      attachments: await listChangeRequestAttachments(changeRequest.id)
    }))
  );
};

export const getChangeManagementAnalytics = async (projectIds?: string[]) => {
  const rows = await listChangeRequests();
  const scoped = projectIds && projectIds.length > 0 ? rows.filter((row) => projectIds.includes(row.projectId)) : rows;
  const byStatus = new Map<ChangeRequestStatus, number>();
  const byProject = new Map<string, ChangeRequestRecord[]>();
  const scheduleTrend = new Map<string, number>();

  scoped.forEach((row) => {
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
    const current = byProject.get(row.projectId) ?? [];
    current.push(row);
    byProject.set(row.projectId, current);
    const month = new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    scheduleTrend.set(month, round2((scheduleTrend.get(month) ?? 0) + row.impactScheduleDays));
  });

  const totalBudgetImpact = round2(
    scoped
      .filter((row) => row.status !== "REJECTED")
      .reduce((sum, row) => sum + row.impactBudgetDelta, 0)
  );

  const approvals = (
    await Promise.all(scoped.map((row) => listChangeRequestApprovals(row.id)))
  ).flat();
  const avgApprovalTimeHours = averageApprovalHours(approvals);

  const activeProjectCount = Array.from(byProject.values()).filter((rowsForProject) =>
    rowsForProject.some((row) => openChangeStatuses.includes(row.status))
  ).length;

  const projectsOver3 = Array.from(byProject.entries())
    .filter(([, rowsForProject]) => rowsForProject.length > 3)
    .map(([projectId, rowsForProject]) => ({
      projectId,
      changes: rowsForProject.length
    }));

  return {
    projectsWithActiveChanges: activeProjectCount,
    changeRequestsByStatus: Object.fromEntries(byStatus.entries()),
    totalBudgetImpact,
    scheduleImpactTrend: Array.from(scheduleTrend.entries()).map(([month, value]) => ({ month, value })),
    avgApprovalTimeHours,
    projectsWithMoreThan3Changes: projectsOver3
  };
};

export const getChangeRequestTemplatesAndThresholds = async (): Promise<Pick<ChangeManagementStore, "templates" | "thresholds">> => {
  const [thresholds, templates] = await Promise.all([getChangeThresholds(), listChangeTemplates()]);
  return { templates, thresholds };
};

export const applyChangeRequestToSubmissionPatch = (
  deltas: ChangeRequestFieldDelta[]
): SubmissionPatch => {
  const patch: Record<string, unknown> = {};
  deltas.forEach((delta) => {
    setPathValue(patch, delta.fieldName, delta.newValue);
  });
  return patch as SubmissionPatch;
};

export const formatChangeRequestRiskLabel = (risk: ProjectChangeIndicator["changeRiskIndicator"]) => {
  if (risk === "NONE") return "None";
  if (risk === "LOW") return "Low";
  if (risk === "MEDIUM") return "Medium";
  if (risk === "HIGH") return "High";
  return "Critical";
};

export const getProjectChangeIndicatorMap = async (
  projectIds: string[]
): Promise<Record<string, ProjectChangeIndicator>> => {
  const entries = await Promise.all(projectIds.map(async (projectId) => [projectId, await getProjectChangeIndicator(projectId)] as const));
  return Object.fromEntries(entries);
};

export const listPendingChangeApprovalsForPrincipal = async (principal: ChangePrincipal) => {
  const role = normalizeRoleType(principal.roleType);
  const details = await listChangeRequestsWithDetails();
  const rows: Array<{
    approvalId: string;
    changeRequestId: string;
    projectId: string;
    roleContext: ChangeApprovalRoleContext;
    requestedAt: string;
    approverName: string;
    approverEmail: string;
    title: string;
  }> = [];

  details.forEach((item) => {
    item.approvals
      .filter((approval) => approval.status === "PENDING")
      .forEach((approval) => {
        const assigned = matchesPrincipal(approval, principal);
        if (!assigned && role !== "ADMIN") {
          return;
        }
        rows.push({
          approvalId: approval.id,
          changeRequestId: item.changeRequest.id,
          projectId: item.changeRequest.projectId,
          roleContext: approval.roleContext,
          requestedAt: approval.requestedAt,
          approverName: approval.approverName,
          approverEmail: approval.approverEmail,
          title: item.changeRequest.title
        });
      });
  });

  return rows;
};

export const getChangeSubmitterLabel = (changeRequest: ChangeRequestRecord) =>
  changeRequest.requestedByName || changeRequest.requestedByEmail || "Project Manager";

export const getProjectSubmitterLabel = (submission: ProjectSubmission) => projectCreatedBy(submission);
