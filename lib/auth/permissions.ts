import type { Session } from "next-auth";

import { findUserByEmail, getDefaultFunctionAccess, type FunctionRight } from "@/lib/auth/users";
import { canAccessModule, projectVisibilityScope } from "@/lib/auth/rbac";
import { normalizeRoleType } from "@/lib/auth/roles";

export const hasFunctionAccess = async (
  session: Session,
  right: FunctionRight
): Promise<boolean> => {
  const user = await findUserByEmail(session.user.email);
  const roleType = normalizeRoleType(user?.roleType ?? session.user.roleType ?? session.user.role);
  const principal = {
    id: user?.id ?? session.user.id,
    email: user?.email ?? session.user.email,
    azureObjectId: user?.azureObjectId ?? session.user.azureObjectId,
    roleType,
    isActive: user?.isActive ?? session.user.isActive ?? true
  };

  if (!principal.isActive) {
    return false;
  }

  const roleFallback = getDefaultFunctionAccess(roleType)[right];

  switch (right) {
    case "manage_reference_data":
    case "manage_user_rights":
      return canAccessModule(principal, "user_admin");
    case "view_all_submissions":
      return projectVisibilityScope(principal, "projects") === "ALL";
    case "run_workflow_actions":
      return (
        canAccessModule(principal, "finance_governance_hub") ||
        canAccessModule(principal, "project_governance_hub") ||
        canAccessModule(principal, "spo_committee_hub") ||
        canAccessModule(principal, "project_management_hub") ||
        canAccessModule(principal, "user_admin")
      );
    case "export_reports":
      return (
        canAccessModule(principal, "dashboard") ||
        canAccessModule(principal, "stratos_lab") ||
        canAccessModule(principal, "user_admin")
      );
    case "sponsor_decision":
      return roleFallback;
    default:
      return roleFallback;
  }
};
