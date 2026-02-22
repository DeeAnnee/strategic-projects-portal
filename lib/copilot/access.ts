import type { Session } from "next-auth";

import { canUserViewSubmission } from "@/lib/auth/project-access";
import { normalizeRoleType } from "@/lib/auth/roles";
import { findUserByEmail } from "@/lib/auth/users";
import { getSubmissionById } from "@/lib/submissions/store";
import type { ProjectSubmission } from "@/lib/submissions/types";

export const canAccessSubmission = async (
  session: Session,
  submission: ProjectSubmission
): Promise<boolean> => {
  const user = await findUserByEmail(session.user.email);
  const principal = {
    id: user?.id ?? session.user.id,
    email: user?.email ?? session.user.email,
    azureObjectId: user?.azureObjectId ?? session.user.azureObjectId,
    roleType: normalizeRoleType(user?.roleType ?? session.user.roleType ?? session.user.role),
    isActive: user?.isActive ?? session.user.isActive ?? true
  };
  return canUserViewSubmission(principal, submission, "stratos_lab");
};

export const getAuthorizedSubmission = async (
  session: Session,
  projectId?: string
): Promise<
  | {
      ok: true;
      submission: ProjectSubmission | null;
    }
  | {
      ok: false;
      status: 403 | 404;
      message: string;
    }
> => {
  if (!projectId) {
    return { ok: true, submission: null };
  }

  const submission = await getSubmissionById(projectId);
  if (!submission) {
    return {
      ok: false,
      status: 404,
      message: "Project not found"
    };
  }

  const allowed = await canAccessSubmission(session, submission);
  if (!allowed) {
    return {
      ok: false,
      status: 403,
      message: "Forbidden"
    };
  }

  return {
    ok: true,
    submission
  };
};
