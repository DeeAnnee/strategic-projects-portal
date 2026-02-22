import { NextResponse } from "next/server";

import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { canAccessModule } from "@/lib/auth/rbac";
import { listBoardCards } from "@/lib/operations/store";

export async function GET() {
  const access = await requireApiPrincipal();
  if ("error" in access) {
    return access.error;
  }

  const principal = toRbacPrincipal(access.principal);
  const allowed =
    canAccessModule(principal, "finance_governance_hub") ||
    canAccessModule(principal, "project_governance_hub") ||
    canAccessModule(principal, "project_management_hub") ||
    canAccessModule(principal, "user_admin");
  if (!allowed) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const rows = await listBoardCards();
  return NextResponse.json({ data: rows });
}
