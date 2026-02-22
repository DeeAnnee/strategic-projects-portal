import { findUserByEmail } from "@/lib/auth/users";
import { getDataStorePath, shouldUseMemoryStoreCache } from "@/lib/storage/data-store-path";
import { cloneJson, safePersistJson, safeReadJsonText } from "@/lib/storage/json-file";
import { resolveCanonicalWorkflowState } from "@/lib/submissions/workflow";
import type {
  ApprovalRequestStageContext,
  ApprovalRequestEntityType,
  ApprovalRequestRecord,
  ApprovalRequestStatus,
  ApprovalStageCode,
  ProjectSubmission,
  WorkflowApprovalRoleContext
} from "@/lib/submissions/types";

const storeFile = getDataStorePath("approval-requests.json");
let inMemoryApprovalRequests: ApprovalRequestRecord[] | null = null;

const nowIso = () => new Date().toISOString();
const normalizeEmail = (value?: string | null) => (value ?? "").trim().toLowerCase();
const normalizeId = (value?: string | null) => (value ?? "").trim();

const readStore = async (): Promise<ApprovalRequestRecord[]> => {
  if (shouldUseMemoryStoreCache() && inMemoryApprovalRequests) {
    return cloneJson(inMemoryApprovalRequests);
  }
  try {
    const raw = await safeReadJsonText(storeFile);
    const parsed = JSON.parse(raw) as ApprovalRequestRecord[];
    const rows = Array.isArray(parsed) ? parsed : [];
    inMemoryApprovalRequests = shouldUseMemoryStoreCache() ? cloneJson(rows) : null;
    return rows;
  } catch {
    inMemoryApprovalRequests = shouldUseMemoryStoreCache() ? [] : null;
    return [];
  }
};

const writeStore = async (rows: ApprovalRequestRecord[]) => {
  inMemoryApprovalRequests = shouldUseMemoryStoreCache() ? cloneJson(rows) : null;
  await safePersistJson(storeFile, rows);
};

const roleContextToStageMap: Record<WorkflowApprovalRoleContext, ApprovalStageCode> = {
  BUSINESS_SPONSOR: "BUSINESS",
  BUSINESS_DELEGATE: "BUSINESS",
  TECH_SPONSOR: "TECHNOLOGY",
  FINANCE_SPONSOR: "FINANCE",
  BENEFITS_SPONSOR: "BENEFITS",
  PROJECT_MANAGER: "PROJECT_MANAGER"
};

export const mapRoleContextToApprovalStage = (roleContext: WorkflowApprovalRoleContext): ApprovalStageCode =>
  roleContextToStageMap[roleContext];

const stageToRoleContextsMap: Record<ApprovalStageCode, WorkflowApprovalRoleContext[]> = {
  BUSINESS: ["BUSINESS_SPONSOR", "BUSINESS_DELEGATE"],
  TECHNOLOGY: ["TECH_SPONSOR"],
  FINANCE: ["FINANCE_SPONSOR"],
  BENEFITS: ["BENEFITS_SPONSOR"],
  PROJECT_MANAGER: ["PROJECT_MANAGER"]
};

const resolveRoleContextsForStage = (stage: ApprovalStageCode): WorkflowApprovalRoleContext[] =>
  stageToRoleContextsMap[stage];

const resolveRoleContextPerson = (
  submission: ProjectSubmission,
  roleContext: WorkflowApprovalRoleContext
): { name: string; email: string; azureObjectId?: string } | null => {
  const contacts = submission.sponsorContacts;
  const legacy = {
    businessSponsor: submission.businessSponsor || submission.sponsorName,
    businessDelegate: submission.businessDelegate || submission.businessCase?.introduction?.businessDelegate || "",
    technologySponsor:
      submission.technologySponsor || submission.businessCase?.introduction?.technologySponsor || "",
    financeSponsor: submission.financeSponsor || submission.businessCase?.introduction?.financeSponsor || "",
    benefitsSponsor: submission.benefitsSponsor || submission.businessCase?.introduction?.benefitsSponsor || ""
  };

  if (roleContext === "BUSINESS_SPONSOR") {
    const ref = contacts?.businessSponsor;
    const email = normalizeEmail(ref?.email || submission.sponsorEmail);
    const name = (ref?.displayName || legacy.businessSponsor || "").trim();
    if (!name && !email) return null;
    return { name: name || email, email, azureObjectId: ref?.azureObjectId };
  }

  if (roleContext === "BUSINESS_DELEGATE") {
    const ref = contacts?.businessDelegate;
    const email = normalizeEmail(ref?.email);
    const name = (ref?.displayName || legacy.businessDelegate || "").trim();
    if (!name && !email) return null;
    return { name: name || email, email, azureObjectId: ref?.azureObjectId };
  }

  if (roleContext === "TECH_SPONSOR") {
    const ref = contacts?.technologySponsor;
    const email = normalizeEmail(ref?.email);
    const name = (ref?.displayName || legacy.technologySponsor || "").trim();
    if (!name && !email) return null;
    return { name: name || email, email, azureObjectId: ref?.azureObjectId };
  }

  if (roleContext === "FINANCE_SPONSOR") {
    const ref = contacts?.financeSponsor;
    const email = normalizeEmail(ref?.email);
    const name = (ref?.displayName || legacy.financeSponsor || "").trim();
    if (!name && !email) return null;
    return { name: name || email, email, azureObjectId: ref?.azureObjectId };
  }

  if (roleContext === "PROJECT_MANAGER") {
    const ownerEmail = normalizeEmail(submission.ownerEmail);
    const ownerName = (submission.ownerName || "").trim();
    if (!ownerName && !ownerEmail) return null;
    return { name: ownerName || ownerEmail, email: ownerEmail };
  }

  const benefitsRef = contacts?.benefitsSponsor;
  const benefitsEmail = normalizeEmail(benefitsRef?.email);
  const benefitsName = (benefitsRef?.displayName || legacy.benefitsSponsor || "").trim();
  if (!benefitsName && !benefitsEmail) return null;
  return { name: benefitsName || benefitsEmail, email: benefitsEmail, azureObjectId: benefitsRef?.azureObjectId };
};

const resolveStageContext = (submission: ProjectSubmission): ApprovalRequestStageContext => {
  const canonical = resolveCanonicalWorkflowState(submission);
  if (canonical.stage === "FUNDING") return "FUNDING";
  if (canonical.stage === "LIVE") return "PM_ASSIGNMENT";
  return "PROPOSAL";
};

const toEntityType = (submission: ProjectSubmission): ApprovalRequestEntityType => {
  const context = resolveStageContext(submission);
  if (context === "FUNDING") return "FUNDING_REQUEST";
  if (context === "PM_ASSIGNMENT") return "PM_ASSIGNMENT";
  return "PROPOSAL";
};

export const getRequiredApprovalRoleContextsForSubmission = (
  submission: ProjectSubmission
): WorkflowApprovalRoleContext[] => {
  const { stage, status } = resolveCanonicalWorkflowState(submission);
  if (stage === "PROPOSAL" && status === "SPONSOR_REVIEW") {
    return ["BUSINESS_SPONSOR"];
  }

  if (stage === "FUNDING" && (status === "SPONSOR_REVIEW" || status === "PGO_FGO_REVIEW")) {
    const contexts: WorkflowApprovalRoleContext[] = ["BUSINESS_SPONSOR"];
    if (resolveRoleContextPerson(submission, "BUSINESS_DELEGATE")) {
      contexts.push("BUSINESS_DELEGATE");
    }
    if (resolveRoleContextPerson(submission, "FINANCE_SPONSOR")) contexts.push("FINANCE_SPONSOR");
    if (resolveRoleContextPerson(submission, "TECH_SPONSOR")) contexts.push("TECH_SPONSOR");
    if (resolveRoleContextPerson(submission, "BENEFITS_SPONSOR")) contexts.push("BENEFITS_SPONSOR");
    return contexts;
  }

  return [];
};

const matchesPrincipal = (
  request: ApprovalRequestRecord,
  principal: { id?: string | null; email?: string | null; azureObjectId?: string | null }
) => {
  const principalId = normalizeId(principal.id);
  const principalEmail = normalizeEmail(principal.email);
  const principalObjectId = normalizeId(principal.azureObjectId);

  return Boolean(
    (principalId && normalizeId(request.approverUserId) && principalId === normalizeId(request.approverUserId)) ||
      (principalEmail && normalizeEmail(request.approverEmail) && principalEmail === normalizeEmail(request.approverEmail)) ||
      (principalObjectId &&
        normalizeId(request.approverAzureObjectId) &&
        principalObjectId === normalizeId(request.approverAzureObjectId))
  );
};

export const listApprovalRequests = async (): Promise<ApprovalRequestRecord[]> => readStore();

export const getApprovalRequestById = async (id: string): Promise<ApprovalRequestRecord | null> => {
  const rows = await readStore();
  return rows.find((row) => row.id === id) ?? null;
};

export const listApprovalRequestsForEntity = async (
  entityId: string,
  entityType?: ApprovalRequestEntityType
): Promise<ApprovalRequestRecord[]> => {
  const rows = await readStore();
  return rows.filter(
    (row) => row.entityId === entityId && (!entityType || row.entityType === entityType)
  );
};

export const listPendingApprovalRequestsForPrincipal = async (
  principal: { id?: string | null; email?: string | null; azureObjectId?: string | null }
) => {
  const rows = await readStore();
  return rows.filter(
    (row) => (row.status === "PENDING" || row.status === "NEED_MORE_INFO") && matchesPrincipal(row, principal)
  );
};

export const listApprovalRequestsInitiatedByPrincipal = async (
  principal: { id?: string | null; email?: string | null; azureObjectId?: string | null }
) => {
  const rows = await readStore();
  const principalId = normalizeId(principal.id);
  const principalEmail = normalizeEmail(principal.email);

  return rows
    .filter((row) => {
      if (principalId && normalizeId(row.createdByUserId) === principalId) {
        return true;
      }
      return Boolean(principalEmail && normalizeEmail(row.createdByUserId) === principalEmail);
    })
    .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
};

export const createApprovalRequestsForSubmission = async (
  submission: ProjectSubmission,
  roleContexts: WorkflowApprovalRoleContext[],
  requestedAt = nowIso(),
  createdByUserId?: string
) => {
  const rows = await readStore();
  const entityType = toEntityType(submission);
  const stageContext = resolveStageContext(submission);
  const created: ApprovalRequestRecord[] = [];

  for (const roleContext of roleContexts) {
    const person = resolveRoleContextPerson(submission, roleContext);
    if (!person?.name) continue;

    const approverEmail = normalizeEmail(person.email);
    const resolvedUser = approverEmail ? await findUserByEmail(approverEmail) : null;
    const existingPending = rows.find(
      (row) =>
        row.entityId === submission.id &&
        row.entityType === entityType &&
        row.roleContext === roleContext &&
        row.status === "PENDING" &&
        normalizeEmail(row.approverEmail) === approverEmail
    );
    if (existingPending) continue;

    const item: ApprovalRequestRecord = {
      id: `apr-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      entityType,
      stageContext,
      entityId: submission.id,
      approverUserId: resolvedUser?.id,
      approverAzureObjectId: person.azureObjectId || resolvedUser?.azureObjectId,
      approverName: person.name,
      approverEmail: approverEmail || resolvedUser?.email || "",
      roleContext,
      status: "PENDING",
      createdByUserId,
      requestedAt,
      createdAt: requestedAt,
      updatedAt: requestedAt
    };

    rows.push(item);
    created.push(item);
  }

  if (created.length > 0) {
    await writeStore(rows);
  }

  return created;
};

export const createApprovalRequest = async (
  input: {
    entityType: ApprovalRequestEntityType;
    stageContext: ApprovalRequestStageContext;
    entityId: string;
    roleContext: WorkflowApprovalRoleContext;
    approverName: string;
    approverEmail: string;
    approverUserId?: string;
    approverAzureObjectId?: string;
    createdByUserId?: string;
    requestedAt?: string;
    comment?: string;
  }
) => {
  const rows = await readStore();
  const requestedAt = input.requestedAt ?? nowIso();

  const existingPending = rows.find(
    (row) =>
      row.entityId === input.entityId &&
      row.entityType === input.entityType &&
      row.roleContext === input.roleContext &&
      row.status === "PENDING" &&
      normalizeEmail(row.approverEmail) === normalizeEmail(input.approverEmail)
  );
  if (existingPending) {
    return existingPending;
  }

  const item: ApprovalRequestRecord = {
    id: `apr-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    entityType: input.entityType,
    stageContext: input.stageContext,
    entityId: input.entityId,
    approverUserId: input.approverUserId,
    approverAzureObjectId: input.approverAzureObjectId,
    approverName: input.approverName,
    approverEmail: normalizeEmail(input.approverEmail),
    roleContext: input.roleContext,
    status: "PENDING",
    createdByUserId: input.createdByUserId,
    requestedAt,
    comment: input.comment?.trim() || undefined,
    createdAt: requestedAt,
    updatedAt: requestedAt
  };
  rows.push(item);
  await writeStore(rows);
  return item;
};

export const cancelPendingApprovalRequestsForSubmission = async (
  submission: ProjectSubmission,
  options?: { reason?: string }
) => {
  const rows = await readStore();
  const entityType = toEntityType(submission);
  const now = nowIso();

  const requiredContexts = new Set(getRequiredApprovalRoleContextsForSubmission(submission));
  const expectedByContext = new Map<WorkflowApprovalRoleContext, string>();
  for (const context of requiredContexts) {
    const person = resolveRoleContextPerson(submission, context);
    expectedByContext.set(context, normalizeEmail(person?.email));
  }

  let changed = false;
  const next = rows.map((row) => {
    if (row.entityId !== submission.id || row.entityType !== entityType || row.status !== "PENDING") {
      return row;
    }
    const expectedEmail = expectedByContext.get(row.roleContext);
    const shouldRemain =
      requiredContexts.has(row.roleContext) &&
      normalizeEmail(row.approverEmail) === expectedEmail;
    if (shouldRemain) {
      return row;
    }
    changed = true;
    return {
      ...row,
      status: "CANCELLED" as ApprovalRequestStatus,
      comment: options?.reason || "Pending request cancelled due to sponsor update.",
      decidedAt: now,
      updatedAt: now
    };
  });

  if (changed) {
    await writeStore(next);
  }
};

export const decideApprovalRequestForPrincipal = async (
  submission: ProjectSubmission,
  input: {
    principal: { id?: string | null; email?: string | null; azureObjectId?: string | null };
    decision: "APPROVED" | "REJECTED" | "NEED_MORE_INFO";
    comment?: string;
    requestId?: string;
    stage?: ApprovalStageCode;
  }
) => {
  const rows = await readStore();
  const entityType = toEntityType(submission);
  const now = nowIso();

  const candidateContexts = input.stage
    ? resolveRoleContextsForStage(input.stage)
    : (["BUSINESS_SPONSOR", "BUSINESS_DELEGATE", "TECH_SPONSOR", "FINANCE_SPONSOR", "BENEFITS_SPONSOR"] as WorkflowApprovalRoleContext[]);

  const index = rows.findIndex((row) => {
    if (
      row.entityId !== submission.id ||
      (!input.requestId && row.entityType !== entityType) ||
      (row.status !== "PENDING" && row.status !== "NEED_MORE_INFO")
    ) {
      return false;
    }
    if (input.requestId && row.id !== input.requestId) {
      return false;
    }
    if (!candidateContexts.includes(row.roleContext)) {
      return false;
    }
    return matchesPrincipal(row, input.principal);
  });

  if (index === -1) {
    throw new Error("No pending approval request assigned to this user for the selected stage.");
  }

  const target = rows[index];
  const nextTarget: ApprovalRequestRecord = {
    ...target,
    status: input.decision,
    comment: input.comment?.trim() || target.comment,
    decidedAt: now,
    updatedAt: now
  };
  rows[index] = nextTarget;

  await writeStore(rows);
  return rows[index];
};

export const getApprovalRequestSummaryForSubmission = async (submission: ProjectSubmission) => {
  const rows = await listApprovalRequestsForEntity(submission.id, toEntityType(submission));
  const requiredContexts = getRequiredApprovalRoleContextsForSubmission(submission);
  const requiredSet = new Set(requiredContexts);

  const byContext = new Map<WorkflowApprovalRoleContext, ApprovalRequestRecord[]>();
  for (const request of rows) {
    if (!requiredSet.has(request.roleContext)) {
      continue;
    }
    const current = byContext.get(request.roleContext) ?? [];
    current.push(request);
    byContext.set(request.roleContext, current);
  }

  const pendingCount = rows.filter((item) => item.status === "PENDING").length;
  const requiredCount = requiredContexts.length;
  const allRequiredApproved = requiredCount > 0 && requiredContexts.every((context) =>
    (byContext.get(context) ?? []).some((item) => item.status === "APPROVED")
  );
  const anyRejected = requiredContexts.some((context) =>
    (byContext.get(context) ?? []).some((item) => item.status === "REJECTED")
  );
  const anyNeedMoreInfo = requiredContexts.some((context) =>
    (byContext.get(context) ?? []).some((item) => item.status === "NEED_MORE_INFO")
  );

  return {
    rows,
    requiredContexts,
    pendingCount,
    allRequiredApproved,
    anyRejected,
    anyNeedMoreInfo
  };
};
