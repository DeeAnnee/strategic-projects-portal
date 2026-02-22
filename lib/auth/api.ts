import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth/options";
import { canAccessModule, type ModuleName, type RbacUser } from "@/lib/auth/rbac";
import { normalizeRoleType, type RoleType } from "@/lib/auth/roles";
import { findUserByEmail, type PortalUser } from "@/lib/auth/users";

export type ApiPrincipal = {
  id: string;
  name?: string | null;
  email?: string | null;
  roleType: RoleType;
  role: RoleType;
  azureObjectId?: string;
  isActive: boolean;
  userRecord?: PortalUser | null;
};

export const toRbacPrincipal = (principal: ApiPrincipal): RbacUser => ({
  id: principal.id,
  email: principal.email,
  azureObjectId: principal.azureObjectId,
  roleType: principal.roleType,
  isActive: principal.isActive
});

export const getApiPrincipal = async (): Promise<ApiPrincipal | null> => {
  const session = await getServerSession(authOptions);
  if (!session) {
    return null;
  }

  const user = await findUserByEmail(session.user.email);
  const roleType = normalizeRoleType(user?.roleType ?? session.user.roleType ?? session.user.role);
  return {
    id: user?.id ?? session.user.id,
    name: user?.name ?? session.user.name,
    email: user?.email ?? session.user.email,
    roleType,
    role: roleType,
    azureObjectId: user?.azureObjectId ?? session.user.azureObjectId,
    isActive: user?.isActive ?? session.user.isActive ?? true,
    userRecord: user
  };
};

export const requireApiPrincipal = async (
  moduleName?: ModuleName
): Promise<{ principal: ApiPrincipal } | { error: NextResponse }> => {
  const principal = await getApiPrincipal();
  if (!principal) {
    return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }

  if (!principal.isActive) {
    return { error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }

  if (moduleName && !canAccessModule(toRbacPrincipal(principal), moduleName)) {
    return { error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }

  return { principal };
};
