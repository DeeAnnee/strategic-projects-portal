import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth/options";
import { canAccessModule, MODULE_NAMES, projectVisibilityScope } from "@/lib/auth/rbac";
import { normalizeRoleType } from "@/lib/auth/roles";
import { findUserByEmail, getDefaultFunctionAccess } from "@/lib/auth/users";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const user = await findUserByEmail(session.user.email);
  const roleType = normalizeRoleType(user?.roleType ?? session.user.roleType ?? session.user.role);
  const principal = {
    id: user?.id ?? session.user.id,
    email: user?.email ?? session.user.email,
    azureObjectId: user?.azureObjectId ?? session.user.azureObjectId,
    roleType,
    isActive: user?.isActive ?? session.user.isActive ?? true
  };

  const moduleAccess = Object.fromEntries(
    MODULE_NAMES.map((moduleName) => [moduleName, canAccessModule(principal, moduleName)])
  );
  const functionAccess = getDefaultFunctionAccess(roleType);

  return NextResponse.json({
    id: principal.id,
    name: user?.name ?? session.user.name,
    email: principal.email,
    roleType,
    role: roleType,
    azureObjectId: principal.azureObjectId ?? "",
    isActive: principal.isActive,
    functionAccess,
    moduleAccess,
    projectVisibility: {
      projects: projectVisibilityScope(principal, "projects"),
      dashboard: projectVisibilityScope(principal, "dashboard"),
      stratosLab: projectVisibilityScope(principal, "stratos_lab")
    }
  });
}
