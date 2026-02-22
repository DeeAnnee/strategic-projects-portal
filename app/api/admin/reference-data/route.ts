import { NextResponse } from "next/server";
import { z } from "zod";

import { getReferenceData, type ReferenceDataKey, updateReferenceList } from "@/lib/admin/reference-data";
import { requireApiPrincipal } from "@/lib/auth/api";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";

const referenceDataKeys: ReferenceDataKey[] = [
  "segments",
  "projectThemes",
  "strategicObjectives",
  "classificationTypes",
  "enterpriseThemes",
  "portfolioEscs",
  "projectCategories",
  "fundingSources",
  "fundingTypes",
  "projectImportanceLevels",
  "projectComplexityLevels",
  "userExperienceImpacts",
  "resourceTypes",
  "capexOpexTypes",
  "availabilityApplicationTiers",
  "strategicNonStrategicOptions",
  "riskAssessmentRequiredOptions"
];

const patchSchema = z.object({
  key: z.enum(referenceDataKeys as [ReferenceDataKey, ...ReferenceDataKey[]]),
  values: z.array(z.string().min(1).max(200))
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

  const data = await getReferenceData();
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

  const updated = await updateReferenceList(parsed.data.key, parsed.data.values);

  try {
    await appendGovernanceAuditLog({
      area: "ADMIN",
      action: "UPDATE_REFERENCE_DATA",
      entityType: "reference-data",
      entityId: parsed.data.key,
      outcome: "SUCCESS",
      actorName: access.principal.name ?? "Admin",
      actorEmail: access.principal.email ?? undefined,
      actorRole: access.principal.roleType,
      details: `Reference list ${parsed.data.key} updated.`,
      metadata: {
        itemCount: parsed.data.values.length
      }
    });
  } catch {
    // Non-blocking audit write.
  }

  return NextResponse.json({ data: updated });
}
