import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canUserApproveSubmissionStage,
  canUserViewSubmission,
  getUserActingAsForSubmissionStage
} from "@/lib/auth/project-access";
import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import {
  decideApprovalRequestForPrincipal,
  getApprovalRequestById,
  mapRoleContextToApprovalStage
} from "@/lib/approvals/requests-store";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";
import {
  getSubmissionById,
  recordProjectApprovalDecision,
  reconcileSubmissionWorkflow,
  updateSubmission
} from "@/lib/submissions/store";
import type { ApprovalRequestRecord, ApprovalStageCode, ProjectSubmission } from "@/lib/submissions/types";

const rejectSchema = z.object({
  requestId: z.string().max(120).optional(),
  stage: z.enum(["BUSINESS", "TECHNOLOGY", "FINANCE", "BENEFITS", "PROJECT_MANAGER"]).optional(),
  comment: z.string().trim().min(1).max(2000)
});

const normalizeEmail = (value?: string | null) => (value ?? "").trim().toLowerCase();
const normalizeId = (value?: string | null) => (value ?? "").trim();

const isRequestAssignedToPrincipal = (
  requestRecord: ApprovalRequestRecord,
  principal: { id?: string | null; email?: string | null; azureObjectId?: string | null }
) => {
  const principalId = normalizeId(principal.id);
  const principalEmail = normalizeEmail(principal.email);
  const principalObjectId = normalizeId(principal.azureObjectId);

  return Boolean(
    (principalId &&
      normalizeId(requestRecord.approverUserId) &&
      principalId === normalizeId(requestRecord.approverUserId)) ||
      (principalEmail &&
        normalizeEmail(requestRecord.approverEmail) &&
        principalEmail === normalizeEmail(requestRecord.approverEmail)) ||
      (principalObjectId &&
        normalizeId(requestRecord.approverAzureObjectId) &&
        principalObjectId === normalizeId(requestRecord.approverAzureObjectId))
  );
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal();
  if ("error" in access) {
    return access.error;
  }
  const principal = access.principal;
  const rbacUser = toRbacPrincipal(principal);

  const { id } = await context.params;
  const submission = await getSubmissionById(id);
  if (!submission) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (!canUserViewSubmission(rbacUser, submission, "projects")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  let requestRecord: ApprovalRequestRecord | null = null;
  let stage = parsed.data.stage as ApprovalStageCode | undefined;
  if (parsed.data.requestId) {
    requestRecord = await getApprovalRequestById(parsed.data.requestId);
    if (
      requestRecord &&
      requestRecord.entityId === submission.id &&
      (requestRecord.status === "PENDING" || requestRecord.status === "NEED_MORE_INFO")
    ) {
      if (!stage) {
        stage = mapRoleContextToApprovalStage(requestRecord.roleContext);
      }
    } else {
      requestRecord = null;
    }
  }
  const resolvedStage = (stage ?? "BUSINESS") as ApprovalStageCode;
  const requestAssignedToPrincipal =
    requestRecord !== null && isRequestAssignedToPrincipal(requestRecord, principal);
  const canApproveByRole = canUserApproveSubmissionStage(rbacUser, submission, resolvedStage);
  if (!requestAssignedToPrincipal && !canApproveByRole) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const actingAs =
    requestAssignedToPrincipal && requestRecord
      ? requestRecord.roleContext === "BUSINESS_DELEGATE"
        ? "DELEGATE"
        : "SPONSOR"
      : getUserActingAsForSubmissionStage(rbacUser, submission, resolvedStage);
  if (!actingAs) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let rejected: ProjectSubmission | null = null;
  try {
    await decideApprovalRequestForPrincipal(submission, {
      principal,
      decision: "REJECTED",
      stage: resolvedStage,
      requestId: parsed.data.requestId,
      comment: parsed.data.comment
    });

    if (resolvedStage === "PROJECT_MANAGER") {
      rejected = submission;
    } else {
      rejected = await recordProjectApprovalDecision(id, {
        stage: resolvedStage,
        status: "REJECTED",
        decidedByUserId: principal.id,
        actingAs,
        comment: parsed.data.comment,
        actorName: principal.name ?? "Approver",
        actorEmail: principal.email ?? undefined
      });
    }
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to record rejection." },
      { status: 400 }
    );
  }
  if (!rejected) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  let responseSubmission: ProjectSubmission = rejected;
  if (resolvedStage === "PROJECT_MANAGER") {
    const movedToChangeReview = await updateSubmission(
      id,
      {
        stage: "LIVE",
        status: "CHANGE_REVIEW",
        workflow: {
          entityType: "FUNDING_REQUEST",
          lifecycleStatus: "ARCHIVED",
          lockReason: "Project manager rejected assignment; moved to change review."
        }
      },
      {
        audit: {
          action: "STATE_CHANGE",
          note: "Project Manager rejected assignment. Transitioned to LIVE/CHANGE_REVIEW.",
          actorName: principal.name ?? "Approver",
          actorEmail: principal.email ?? undefined
        }
      }
    );
    if (movedToChangeReview) {
      responseSubmission = movedToChangeReview;
    }
  } else {
    const reconciled = await reconcileSubmissionWorkflow(id, {
      actorName: principal.name ?? "Approver",
      actorEmail: principal.email ?? undefined,
      reason: `Rejection recorded for stage ${resolvedStage}.`
    });
    if (reconciled) {
      responseSubmission = reconciled;
    }
  }

  try {
    await appendGovernanceAuditLog({
      area: "WORKFLOW",
      action: "REJECT_PROJECT_STAGE",
      entityType: "submission",
      entityId: id,
      outcome: "SUCCESS",
      actorName: principal.name ?? "Approver",
      actorEmail: principal.email ?? undefined,
      actorRole: principal.roleType,
      details: `Rejection recorded for stage ${resolvedStage}.`,
      metadata: {
        stage: resolvedStage,
        actingAs
      }
    });
  } catch {
    // Non-blocking audit write.
  }

  return NextResponse.json({ data: responseSubmission });
}
