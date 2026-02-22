import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { canAccessModule, type ModuleName } from "@/lib/auth/rbac";
import { normalizeRoleType, type RoleType } from "@/lib/auth/roles";
import { findUserByEmail } from "@/lib/auth/users";

type SessionUserShape = {
  id: string;
  name?: string | null;
  email?: string | null;
  roleType: RoleType;
  role: RoleType;
  azureObjectId: string;
  isActive: boolean;
  jobTitle?: string;
  department?: string;
  photoUrl?: string;
};

const roleHomePaths: Array<{ module: ModuleName; href: string }> = [
  { module: "projects", href: "/submissions" },
  { module: "dashboard", href: "/dashboard" },
  { module: "stratos_lab", href: "/ai-helper" },
  { module: "finance_governance_hub", href: "/finance" },
  { module: "project_governance_hub", href: "/operations" },
  { module: "project_management_hub", href: "/project-management-hub" },
  { module: "spo_committee_hub", href: "/spo-committee" },
  { module: "user_admin", href: "/admin" }
];

export const getDefaultPortalPath = (user: SessionUserShape): string => {
  const accessible = roleHomePaths.find((entry) => canAccessModule(user, entry.module));
  return accessible?.href ?? "/";
};

export const getSessionOrRedirect = async (moduleName?: ModuleName) => {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const persistedUser = await findUserByEmail(session.user.email);
  const roleType = normalizeRoleType(persistedUser?.roleType ?? session.user.roleType ?? session.user.role);
  const resolvedUser: SessionUserShape = {
    id: persistedUser?.id ?? session.user.id,
    name: persistedUser?.name ?? session.user.name,
    email: persistedUser?.email ?? session.user.email,
    roleType,
    role: roleType,
    azureObjectId: persistedUser?.azureObjectId ?? session.user.azureObjectId ?? "",
    isActive: persistedUser?.isActive ?? session.user.isActive ?? true,
    jobTitle: persistedUser?.jobTitle,
    department: persistedUser?.department,
    photoUrl: persistedUser?.photoUrl
  };

  if (!resolvedUser.isActive) {
    redirect("/login");
  }

  if (moduleName && !canAccessModule(resolvedUser, moduleName)) {
    redirect(getDefaultPortalPath(resolvedUser));
  }

  return {
    ...session,
    user: {
      ...resolvedUser
    }
  };
};

export const requireRole = async (roles: RoleType[]) => {
  const session = await getSessionOrRedirect();
  const effectiveRole = session.user.roleType;

  if (!roles.includes(effectiveRole)) {
    redirect(getDefaultPortalPath(session.user));
  }
  return session;
};

export const requireModuleAccess = async (moduleName: ModuleName) =>
  getSessionOrRedirect(moduleName);
