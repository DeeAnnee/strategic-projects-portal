import {
  canApproveProject,
  canEditProject,
  canViewProject,
  getProjectApprovalActingAs,
  type ApprovalActingAs,
  type ApprovalStage,
  type ApprovalStatus,
  type ModuleName,
  type ProjectAccessTarget,
  type RbacUser
} from "@/lib/auth/rbac";
import type {
  ProjectApprovalStageRecord,
  ProjectAssignment,
  ProjectSubmission,
  SponsorContacts
} from "@/lib/submissions/types";

const normalizeEmail = (value?: string | null) => (value ?? "").trim().toLowerCase();
const normalizeId = (value?: string | null) => (value ?? "").trim();

const toPerson = (
  value?: {
    azureObjectId?: string;
    displayName?: string;
    email?: string;
    jobTitle?: string;
    photoUrl?: string;
  } | null
) =>
  value
    ? {
        objectId: value.azureObjectId ?? undefined,
        email: value.email ?? undefined
      }
    : null;

const mapAssignments = (assignments?: ProjectAssignment[] | null) =>
  (assignments ?? []).map((assignment) => ({
    userId: assignment.userId,
    userEmail: assignment.userEmail,
    userAzureObjectId: assignment.userAzureObjectId
  }));

const resolveLegacyBusinessSponsor = (submission: ProjectSubmission) => {
  const fallbackEmail = normalizeEmail(submission.sponsorEmail);
  return {
    objectId: "",
    email: fallbackEmail || undefined
  };
};

export const toProjectAccessTarget = (submission: ProjectSubmission): ProjectAccessTarget => {
  const sponsorContacts: SponsorContacts | undefined = submission.sponsorContacts;
  const businessSponsor = toPerson(sponsorContacts?.businessSponsor) ?? resolveLegacyBusinessSponsor(submission);
  const businessDelegate = toPerson(sponsorContacts?.businessDelegate);
  const technologySponsor = toPerson(sponsorContacts?.technologySponsor);
  const financeSponsor = toPerson(sponsorContacts?.financeSponsor);
  const benefitsSponsor = toPerson(sponsorContacts?.benefitsSponsor);

  return {
    id: submission.id,
    createdByUserId: submission.createdByUserId,
    ownerEmail: submission.ownerEmail,
    assignments: mapAssignments(submission.assignments),
    businessSponsorObjectId: businessSponsor.objectId,
    businessSponsorEmail: businessSponsor.email,
    businessDelegateObjectId: businessDelegate?.objectId,
    businessDelegateEmail: businessDelegate?.email,
    technologySponsorObjectId: technologySponsor?.objectId,
    technologySponsorEmail: technologySponsor?.email,
    financeSponsorObjectId: financeSponsor?.objectId,
    financeSponsorEmail: financeSponsor?.email,
    benefitsSponsorObjectId: benefitsSponsor?.objectId,
    benefitsSponsorEmail: benefitsSponsor?.email
  };
};

export const canUserViewSubmission = (
  user: RbacUser,
  submission: ProjectSubmission,
  moduleName: ModuleName = "projects"
) => canViewProject(user, toProjectAccessTarget(submission), moduleName);

export const canUserEditSubmission = (user: RbacUser, submission: ProjectSubmission) =>
  canEditProject(user, toProjectAccessTarget(submission));

export const filterSubmissionsByAccess = (
  user: RbacUser,
  submissions: ProjectSubmission[],
  moduleName: ModuleName = "projects"
) => submissions.filter((submission) => canUserViewSubmission(user, submission, moduleName));

export const getSubmissionApprovalStageRecord = (
  submission: ProjectSubmission,
  stage: ApprovalStage
): ProjectApprovalStageRecord | null => {
  const approvals = submission.approvalStages ?? [];
  return approvals.find((entry) => entry.stage === stage) ?? null;
};

export const getCurrentPendingApprovalStage = (
  submission: ProjectSubmission
): ProjectApprovalStageRecord | null => {
  const approvals = submission.approvalStages ?? [];
  return approvals.find((entry) => entry.status === "PENDING") ?? null;
};

export const canUserApproveSubmissionStage = (
  user: RbacUser,
  submission: ProjectSubmission,
  stage: ApprovalStage
): boolean => {
  if (stage === "PROJECT_MANAGER") {
    return canApproveProject(user, toProjectAccessTarget(submission), {
      stage: "PROJECT_MANAGER",
      status: "PENDING"
    });
  }

  const record = getSubmissionApprovalStageRecord(submission, stage);
  if (!record) {
    return false;
  }
  return canApproveProject(user, toProjectAccessTarget(submission), {
    stage: record.stage,
    status: record.status
  });
};

export const getUserActingAsForSubmissionStage = (
  user: RbacUser,
  submission: ProjectSubmission,
  stage: ApprovalStage
): ApprovalActingAs | null =>
  getProjectApprovalActingAs(user, toProjectAccessTarget(submission), stage);

export const isStagePending = (
  submission: ProjectSubmission,
  stage: ApprovalStage,
  status?: ApprovalStatus | null
) => {
  const record = getSubmissionApprovalStageRecord(submission, stage);
  if (!record) {
    return false;
  }
  return status ? record.status === status : record.status === "PENDING";
};

export const isPrincipalAssignedToSubmission = (user: RbacUser, submission: ProjectSubmission) => {
  const userId = normalizeId(user.id);
  const userEmail = normalizeEmail(user.email);
  const userAzureObjectId = normalizeId(user.azureObjectId);
  return (submission.assignments ?? []).some((assignment) => {
    const assignmentUserId = normalizeId(assignment.userId);
    const assignmentUserEmail = normalizeEmail(assignment.userEmail);
    const assignmentUserAzureObjectId = normalizeId(assignment.userAzureObjectId);

    return Boolean(
      (userId && assignmentUserId && userId === assignmentUserId) ||
        (userEmail && assignmentUserEmail && userEmail === assignmentUserEmail) ||
        (userAzureObjectId &&
          assignmentUserAzureObjectId &&
          userAzureObjectId === assignmentUserAzureObjectId)
    );
  });
};
