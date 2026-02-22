import { NextResponse } from "next/server";

import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { canAccessModule } from "@/lib/auth/rbac";
import { listGovernanceAuditLog } from "@/lib/governance/audit-log";

const requireGovernanceAuditAccess = async () => {
  const access = await requireApiPrincipal();
  if ("error" in access) {
    return access;
  }

  const principal = toRbacPrincipal(access.principal);
  const allowed = Boolean(
    canAccessModule(principal, "user_admin") ||
      canAccessModule(principal, "finance_governance_hub") ||
      canAccessModule(principal, "project_governance_hub") ||
      canAccessModule(principal, "spo_committee_hub")
  );

  if (!allowed) {
    return { error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }

  return access;
};

export async function GET(request: Request) {
  const access = await requireGovernanceAuditAccess();
  if ("error" in access) {
    return access.error;
  }

  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") ?? "200");
  const data = await listGovernanceAuditLog(requestedLimit);

  return NextResponse.json({ data });
}
