import { NextResponse } from "next/server";
import { z } from "zod";

import { persistenceErrorResponse } from "@/lib/api/error-response";
import { canUserViewSubmission } from "@/lib/auth/project-access";
import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { canAccessModule } from "@/lib/auth/rbac";
import { findUserByEmail } from "@/lib/auth/users";
import { createApprovalRequest } from "@/lib/approvals/requests-store";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";
import { notifyApprovalRequestCreated } from "@/lib/notifications/provider";
import { getSubmissionById, updateSubmission } from "@/lib/submissions/store";
import { resolveCanonicalWorkflowState } from "@/lib/submissions/workflow";

const assignSchema = z.object({
  managerEmail: z.string().email(),
  managerName: z.string().trim().min(1).max(200).optional()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal();
  if ("error" in access) {
    return access.error;
  }
  const principal = access.principal;
  const rbacUser = toRbacPrincipal(principal);
  const canManageAssignments = canAccessModule(rbacUser, "user_admin");
  if (!canManageAssignments) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;
  let submission: Awaited<ReturnType<typeof getSubmissionById>> = null;
  try {
    submission = await getSubmissionById(id);
  } catch (error) {
    return persistenceErrorResponse(error, "Failed to load project for PM assignment.");
  }
  if (!submission) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (!canUserViewSubmission(rbacUser, submission, "projects")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const canonical = resolveCanonicalWorkflowState(submission);
  if (!(canonical.stage === "FUNDING" && canonical.status === "APPROVED")) {
    return NextResponse.json(
      { message: "Project manager assignment can only be requested after funding approval." },
      { status: 400 }
    );
  }

  const selectedManager = await findUserByEmail(parsed.data.managerEmail);
  const managerName = parsed.data.managerName || selectedManager?.name || parsed.data.managerEmail;

  let patched: Awaited<ReturnType<typeof updateSubmission>> = null;
  try {
    patched = await updateSubmission(
      id,
      {
        ownerName: managerName,
        ownerEmail: parsed.data.managerEmail.toLowerCase()
      },
      {
        audit: {
          action: "FIELD_EDIT",
          note: `Project Manager assignment requested for ${managerName}.`,
          actorName: principal.name ?? "PM Hub Admin",
          actorEmail: principal.email ?? undefined
        }
      }
    );
  } catch (error) {
    return persistenceErrorResponse(error, "Failed to persist project manager assignment.");
  }
  if (!patched) {
    return NextResponse.json({ message: "Unable to update project manager assignment." }, { status: 500 });
  }

  let approvalRequest: Awaited<ReturnType<typeof createApprovalRequest>> | null = null;
  try {
    approvalRequest = await createApprovalRequest({
      entityType: "PM_ASSIGNMENT",
      stageContext: "PM_ASSIGNMENT",
      entityId: id,
      roleContext: "PROJECT_MANAGER",
      approverName: managerName,
      approverEmail: parsed.data.managerEmail,
      approverUserId: selectedManager?.id,
      approverAzureObjectId: selectedManager?.azureObjectId,
      createdByUserId: principal.id ?? principal.email
    });
  } catch (error) {
    return persistenceErrorResponse(error, "Failed to create project manager approval request.");
  }
  if (!approvalRequest) {
    return NextResponse.json({ message: "Unable to create project manager approval request." }, { status: 500 });
  }

  try {
    await notifyApprovalRequestCreated(patched, approvalRequest);
  } catch (error) {
    return persistenceErrorResponse(error, "Failed to queue project manager notification.");
  }

  try {
    await appendGovernanceAuditLog({
      area: "WORKFLOW",
      action: "PM_ASSIGNMENT_REQUESTED",
      entityType: "submission",
      entityId: id,
      outcome: "SUCCESS",
      actorName: principal.name ?? "PM Hub Admin",
      actorEmail: principal.email ?? undefined,
      actorRole: principal.roleType,
      details: `Project manager assignment request sent to ${managerName}.`,
      metadata: {
        managerEmail: parsed.data.managerEmail.toLowerCase()
      }
    });
  } catch {
    // Non-blocking audit write.
  }

  return NextResponse.json({ data: { submission: patched, approvalRequest } });
}
