import type { Session } from "next-auth";

import { canUserViewSubmission } from "@/lib/auth/project-access";
import { normalizeRoleType, type RoleType } from "@/lib/auth/roles";
import { findUserByEmail } from "@/lib/auth/users";
import { listPendingApprovalRequestsForPrincipal } from "@/lib/approvals/requests-store";
import { getSubmissionById } from "@/lib/submissions/store";
import type { ProjectSubmission } from "@/lib/submissions/types";

export type CopilotPrincipal = {
  id: string;
  email: string;
  azureObjectId: string;
  roleType: RoleType;
  isActive: boolean;
  name: string;
};

export type CopilotPermissionProfile = {
  canView: boolean;
  canGenerateArtifacts: boolean;
  canGenerateApprovalCommentary: boolean;
  isOwner: boolean;
  isApprovalAssignee: boolean;
  permissionsSummary: string;
};

export const buildCopilotPrincipal = async (session: Session): Promise<CopilotPrincipal> => {
  const user = await findUserByEmail(session.user.email);
  const roleType = normalizeRoleType(user?.roleType ?? session.user.roleType ?? session.user.role);
  return {
    id: user?.id ?? session.user.id,
    name: user?.name ?? session.user.name ?? "Portal User",
    email: user?.email ?? session.user.email ?? "",
    azureObjectId: user?.azureObjectId ?? session.user.azureObjectId ?? "",
    roleType,
    isActive: user?.isActive ?? session.user.isActive ?? true
  };
};

const isProjectOwner = (principal: CopilotPrincipal, submission: ProjectSubmission) => {
  const principalEmail = principal.email.toLowerCase();
  if (submission.createdByUserId && submission.createdByUserId === principal.id) {
    return true;
  }
  return Boolean(submission.ownerEmail && submission.ownerEmail.toLowerCase() === principalEmail);
};

const buildPermissionSummary = (profile: CopilotPermissionProfile, roleType: RoleType) => {
  const parts = [
    `role=${roleType}`,
    profile.canView ? "view=allowed" : "view=denied",
    profile.canGenerateArtifacts ? "artifact_generation=allowed" : "artifact_generation=denied",
    profile.canGenerateApprovalCommentary ? "approval_commentary=allowed" : "approval_commentary=denied",
    profile.isOwner ? "owner_project=true" : "owner_project=false",
    profile.isApprovalAssignee ? "approval_assignee=true" : "approval_assignee=false"
  ];
  return parts.join("; ");
};

export const canAccessSubmission = async (
  session: Session,
  submission: ProjectSubmission
): Promise<boolean> => {
  const principal = await buildCopilotPrincipal(session);
  return canUserViewSubmission(principal, submission, "stratos_lab");
};

const computePermissionProfile = async (
  principal: CopilotPrincipal,
  submission: ProjectSubmission,
  isVisibleByRbac: boolean
): Promise<CopilotPermissionProfile> => {
  const pendingApprovals = await listPendingApprovalRequestsForPrincipal({
    id: principal.id,
    email: principal.email,
    azureObjectId: principal.azureObjectId
  });

  const isApprovalAssignee = pendingApprovals.some((request) => request.entityId === submission.id);
  const isOwner = isProjectOwner(principal, submission);
  const canView = isVisibleByRbac || isApprovalAssignee;

  let canGenerateArtifacts = false;
  let canGenerateApprovalCommentary = false;

  if (principal.roleType === "ADMIN" || principal.roleType === "PROJECT_MANAGEMENT_HUB_ADMIN") {
    canGenerateArtifacts = true;
  } else if (principal.roleType === "BASIC_USER") {
    canGenerateArtifacts = isOwner;
  } else if (
    principal.roleType === "FINANCE_GOVERNANCE_USER" ||
    principal.roleType === "PROJECT_GOVERNANCE_USER"
  ) {
    canGenerateArtifacts = isOwner;
  } else {
    canGenerateArtifacts = isOwner;
  }

  // "Basic approver" is dynamic and based on active approvals scoped to the current project.
  if (!isOwner && isApprovalAssignee) {
    canGenerateApprovalCommentary = true;
    canGenerateArtifacts = false;
  }

  const profile: CopilotPermissionProfile = {
    canView,
    canGenerateArtifacts,
    canGenerateApprovalCommentary,
    isOwner,
    isApprovalAssignee,
    permissionsSummary: ""
  };
  profile.permissionsSummary = buildPermissionSummary(profile, principal.roleType);
  return profile;
};

export const getAuthorizedSubmission = async (
  session: Session,
  projectId?: string
): Promise<
  | {
      ok: true;
      submission: ProjectSubmission | null;
      principal: CopilotPrincipal;
      permissions: CopilotPermissionProfile;
    }
  | {
      ok: false;
      status: 403 | 404;
      message: string;
      principal?: CopilotPrincipal;
    }
> => {
  const principal = await buildCopilotPrincipal(session);
  const emptyProfile: CopilotPermissionProfile = {
    canView: true,
    canGenerateArtifacts: true,
    canGenerateApprovalCommentary: false,
    isOwner: false,
    isApprovalAssignee: false,
    permissionsSummary: `role=${principal.roleType}; cross_project_context=true`
  };

  if (!projectId) {
    return { ok: true, submission: null, principal, permissions: emptyProfile };
  }

  const submission = await getSubmissionById(projectId);
  if (!submission) {
    return {
      ok: false,
      status: 404,
      message: "Project not found",
      principal
    };
  }

  const visibleByRbac = canUserViewSubmission(principal, submission, "stratos_lab");
  const permissions = await computePermissionProfile(principal, submission, visibleByRbac);
  if (!permissions.canView) {
    return {
      ok: false,
      status: 403,
      message: "Forbidden",
      principal
    };
  }

  return {
    ok: true,
    submission,
    principal,
    permissions
  };
};

