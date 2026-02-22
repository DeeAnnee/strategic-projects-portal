import { NextResponse } from "next/server";

import { persistenceErrorResponse } from "@/lib/api/error-response";
import { canUserEditSubmission, canUserViewSubmission } from "@/lib/auth/project-access";
import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";
import { normalizeRoleType } from "@/lib/auth/roles";
import { DATE_ORDER_ERROR_MESSAGE, isEndBeforeStart } from "@/lib/submissions/date-validation";
import { draftSubmissionSchema } from "@/lib/submissions/schema";
import { getSubmissionById, updateSubmission } from "@/lib/submissions/store";
import { isWorkflowEditableStatus, resolveWorkflowLifecycleStatus } from "@/lib/submissions/workflow";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("projects");
  if ("error" in access) {
    return access.error;
  }

  const { id } = await context.params;
  let item: Awaited<ReturnType<typeof getSubmissionById>> = null;
  try {
    item = await getSubmissionById(id);
  } catch (error) {
    return persistenceErrorResponse(error, "Failed to load submission.");
  }
  if (!item) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  const rbacUser = toRbacPrincipal(access.principal);
  const canViewViaProjects = canUserViewSubmission(rbacUser, item, "projects");
  const canViewViaDashboard = canUserViewSubmission(rbacUser, item, "dashboard");
  if (!canViewViaProjects && !canViewViaDashboard) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data: item });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("projects");
  if ("error" in access) {
    return access.error;
  }

  const body = await request.json();
  const parsed = draftSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Validation failed",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  let existing: Awaited<ReturnType<typeof getSubmissionById>> = null;
  try {
    existing = await getSubmissionById(id);
  } catch (error) {
    return persistenceErrorResponse(error, "Failed to load submission.");
  }
  if (!existing) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (!canUserViewSubmission(toRbacPrincipal(access.principal), existing, "projects")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (!canUserEditSubmission(toRbacPrincipal(access.principal), existing)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const currentEmail = access.principal.email?.toLowerCase() ?? "";
  const isOwner = currentEmail !== "" && currentEmail === existing.ownerEmail.toLowerCase();
  const lifecycleStatus = resolveWorkflowLifecycleStatus(existing);
  const actorRole = normalizeRoleType(access.principal.roleType);
  const hasElevatedEditAccess =
    actorRole === "PROJECT_MANAGEMENT_HUB_ADMIN" || actorRole === "ADMIN";
  const normalizedStatus = (existing.status ?? "").trim().toUpperCase();
  const normalizedStage = (existing.stage ?? "").trim().toUpperCase();
  const normalizedFundingStatus = (existing.workflow?.fundingStatus ?? "").trim().toUpperCase();
  const approvedOrDeliveryLocked =
    ((normalizedStage === "FUNDING" && normalizedStatus === "APPROVED") ||
      normalizedStage === "LIVE" ||
      normalizedFundingStatus === "LIVE") &&
    request.headers.get("x-change-management-apply") !== "1";

  if (approvedOrDeliveryLocked) {
    return NextResponse.json(
      {
        message:
          "Approved/Delivery projects are view-only. Submit a Change Request in Project Management Hub > Change Management."
      },
      { status: 403 }
    );
  }

  const isSubmitterLocked = isOwner && !hasElevatedEditAccess && !isWorkflowEditableStatus(lifecycleStatus);

  if (isSubmitterLocked) {
    return NextResponse.json(
      {
        message:
          "This submission is locked in workflow and is view-only until returned to an editable draft state."
      },
      { status: 403 }
    );
  }

  const effectiveStartDate = parsed.data.startDate ?? existing.startDate;
  const effectiveEndDate = parsed.data.endDate ?? existing.endDate;
  if (isEndBeforeStart(effectiveStartDate, effectiveEndDate)) {
    return NextResponse.json(
      {
        message: "Validation failed",
        issues: {
          formErrors: [],
          fieldErrors: {
            endDate: [DATE_ORDER_ERROR_MESSAGE]
          }
        }
      },
      { status: 400 }
    );
  }

  const normalizedOwnerName =
    existing.ownerName && existing.ownerName !== "Project Owner"
      ? existing.ownerName
      : access.principal.name || "Project Owner";
  const normalizedOwnerEmail =
    existing.ownerEmail && existing.ownerEmail !== "owner@portal.local"
      ? existing.ownerEmail
      : access.principal.email || "owner@portal.local";
  const canReassignProjectManager = hasElevatedEditAccess;
  const requestedOwnerName = parsed.data.ownerName?.trim();
  const requestedOwnerEmail = parsed.data.ownerEmail?.trim().toLowerCase();
  const ownerNameToPersist = canReassignProjectManager
    ? requestedOwnerName || normalizedOwnerName
    : normalizedOwnerName;
  const ownerEmailToPersist = canReassignProjectManager
    ? requestedOwnerEmail || normalizedOwnerEmail
    : normalizedOwnerEmail;

  const patchData = {
    ...parsed.data,
    ownerName: ownerNameToPersist,
    ownerEmail: ownerEmailToPersist
  };
  if (!hasElevatedEditAccess) {
    delete patchData.stage;
    delete patchData.status;
    delete patchData.workflow;
  }

  let updated: Awaited<ReturnType<typeof updateSubmission>> = null;
  try {
    updated = await updateSubmission(id, patchData, {
      audit: {
        action: "UPDATED",
        note: "Submission details updated via edit form.",
        actorName: access.principal.name ?? "Portal User",
        actorEmail: access.principal.email ?? undefined
      }
    });
  } catch (error) {
    return persistenceErrorResponse(error, "Failed to save submission changes.");
  }

  if (!updated) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  try {
    await appendGovernanceAuditLog({
      area: "SUBMISSIONS",
      action: "UPDATE_SUBMISSION",
      entityType: "submission",
      entityId: updated.id,
      outcome: "SUCCESS",
      actorName: access.principal.name ?? "Portal User",
      actorEmail: access.principal.email ?? undefined,
      actorRole: access.principal.roleType,
      details: "Submission patched through /api/submissions/[id].",
      metadata: {
        stage: updated.stage,
        status: updated.status
      }
    });
  } catch {
    // Non-blocking audit write.
  }

  return NextResponse.json({ data: updated });
}
