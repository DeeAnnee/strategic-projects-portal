import { NextResponse } from "next/server";

import { canUserViewSubmission } from "@/lib/auth/project-access";
import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import {
  listApprovalRequestsInitiatedByPrincipal,
  listPendingApprovalRequestsForPrincipal,
  mapRoleContextToApprovalStage
} from "@/lib/approvals/requests-store";
import { listPendingChangeApprovalsForPrincipal } from "@/lib/change-management/service";
import { listSubmissions } from "@/lib/submissions/store";

export async function GET() {
  const access = await requireApiPrincipal();
  if ("error" in access) {
    return access.error;
  }
  const principal = access.principal;
  const rbacUser = toRbacPrincipal(principal);

  const [requests, initiatedRequests, changeApprovals] = await Promise.all([
    listPendingApprovalRequestsForPrincipal(principal),
    listApprovalRequestsInitiatedByPrincipal(principal),
    listPendingChangeApprovalsForPrincipal(principal)
  ]);
  const submissions = await listSubmissions();
  const byId = new Map(submissions.map((submission) => [submission.id, submission]));

  const sentToMe = requests
    .map((request) => {
      const submission = byId.get(request.entityId);
      if (!submission) {
        return null;
      }
      if (!canUserViewSubmission(rbacUser, submission, "projects")) {
        return null;
      }

      const stage = mapRoleContextToApprovalStage(request.roleContext);
      const actingAs = request.roleContext === "BUSINESS_DELEGATE" ? "DELEGATE" : "SPONSOR";

      return {
        requestId: request.id,
        changeRequestId: undefined,
        projectId: submission.id,
        projectName: submission.title,
        entityType: request.entityType,
        roleContext: request.roleContext,
        stage,
        status: request.status,
        actingAs,
        createdByUserId: request.createdByUserId,
        requestedAt: request.requestedAt,
        decidedAt: request.decidedAt,
        dueDate: submission.dueDate,
        ownerName: submission.ownerName,
        ownerEmail: submission.ownerEmail,
        sponsorComment: request.comment ?? null
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const changeQueue = changeApprovals
    .map((approval) => {
      const submission = byId.get(approval.projectId);
      if (!submission) {
        return null;
      }
      if (!canUserViewSubmission(rbacUser, submission, "projects")) {
        return null;
      }

      return {
        requestId: approval.approvalId,
        changeRequestId: approval.changeRequestId,
        projectId: submission.id,
        projectName: submission.title,
        entityType: "CHANGE_REQUEST" as const,
        roleContext: approval.roleContext,
        stage: "CHANGE" as const,
        status: "PENDING" as const,
        actingAs: null,
        createdByUserId: undefined,
        requestedAt: approval.requestedAt,
        decidedAt: undefined,
        dueDate: submission.dueDate,
        ownerName: submission.ownerName,
        ownerEmail: submission.ownerEmail,
        sponsorComment: approval.title
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const sentByMe = initiatedRequests
    .map((request) => {
      const submission = byId.get(request.entityId);
      if (!submission) return null;
      if (!canUserViewSubmission(rbacUser, submission, "projects")) return null;

      return {
        requestId: request.id,
        projectId: submission.id,
        projectName: submission.title,
        entityType: request.entityType,
        roleContext: request.roleContext,
        stage: mapRoleContextToApprovalStage(request.roleContext),
        status: request.status,
        requestedAt: request.requestedAt,
        decidedAt: request.decidedAt,
        comment: request.comment ?? null,
        approverName: request.approverName,
        approverEmail: request.approverEmail
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return NextResponse.json({
    data: {
      sentToMe: [...sentToMe, ...changeQueue],
      sentByMe
    }
  });
}
