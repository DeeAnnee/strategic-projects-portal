import { NextResponse } from "next/server";
import { z } from "zod";

import { getBusinessCaseConfig, updateBusinessCaseConfig } from "@/lib/admin/business-case-config";
import { requireApiPrincipal } from "@/lib/auth/api";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";

const patchSchema = z.object({
  depreciationRules: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        usefulLifeYears: z.coerce.number().min(1).max(100)
      })
    )
    .optional(),
  depreciationCategoryMap: z.record(z.string().max(120), z.array(z.string().max(200))).optional(),
  kpiMetricMap: z.record(z.string().max(120), z.array(z.string().max(200))).optional(),
  payGradeMonthlySalaryUsd: z.record(z.string().max(120), z.coerce.number().min(0).max(1_000_000)).optional()
});

const requireAdminReferenceAccess = async () => {
  const access = await requireApiPrincipal("user_admin");
  if ("error" in access) {
    return access;
  }

  return access;
};

export async function GET() {
  const access = await requireAdminReferenceAccess();
  if ("error" in access) {
    return access.error;
  }

  const data = await getBusinessCaseConfig();
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const access = await requireAdminReferenceAccess();
  if ("error" in access) {
    return access.error;
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await updateBusinessCaseConfig(parsed.data);

  try {
    await appendGovernanceAuditLog({
      area: "ADMIN",
      action: "UPDATE_BUSINESS_CASE_CONFIG",
      entityType: "business-case-config",
      outcome: "SUCCESS",
      actorName: access.principal.name ?? "Admin",
      actorEmail: access.principal.email ?? undefined,
      actorRole: access.principal.roleType,
      details: "Business Case calculation/config mappings updated."
    });
  } catch {
    // Non-blocking audit write.
  }

  return NextResponse.json({ data: updated });
}
