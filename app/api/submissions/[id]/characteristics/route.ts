import { NextResponse } from "next/server";
import { z } from "zod";

import { persistenceErrorResponse } from "@/lib/api/error-response";
import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { canUserViewSubmission } from "@/lib/auth/project-access";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";
import { markGovernanceCharacteristicsUpdated } from "@/lib/operations/store";
import { getSubmissionById, updateSubmission } from "@/lib/submissions/store";
import { resolveCanonicalWorkflowState } from "@/lib/submissions/workflow";

const characteristicsSchema = z.object({
  category: z.string().min(1).max(200),
  projectTheme: z.string().min(1).max(120),
  strategicObjective: z.string().min(1).max(160),
  specificClassificationType: z.string().min(1).max(200),
  enterpriseProjectTheme: z.string().min(1).max(200),
  portfolioEsc: z.string().max(200).optional(),
  fundingType: z.string().max(120).optional(),
  fundingSource: z.string().max(120).optional()
});

const deriveProjectClassification = (value: string) => value.toUpperCase().slice(0, 4);

const deriveProjectType = (classification: string) => {
  const code = classification.toUpperCase();
  const growCodes = new Set(["GRO ", "PRO ", "DISC", "TRAN"]);
  const runCodes = new Set(["PS&E", "RG 1", "RG 2", "RG 3", "MOP ", "EVER"]);

  if (growCodes.has(code)) return "Grow";
  if (runCodes.has(code)) return "Run";
  return "";
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("project_governance_hub");
  if ("error" in access) {
    return access.error;
  }
  const principal = access.principal;
  const rbacUser = toRbacPrincipal(principal);

  const body = await request.json();
  const parsed = characteristicsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Validation failed",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  let existing: Awaited<ReturnType<typeof getSubmissionById>> = null;
  try {
    existing = await getSubmissionById(id);
  } catch (error) {
    return persistenceErrorResponse(error, "Failed to load submission characteristics.");
  }
  if (!existing) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (!canUserViewSubmission(rbacUser, existing, "dashboard")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const canonical = resolveCanonicalWorkflowState(existing);
  const isGovernanceEditable = canonical.stage !== "LIVE";
  if (!isGovernanceEditable) {
    return NextResponse.json(
      { message: "Characteristics are locked once the project is Live." },
      { status: 400 }
    );
  }

  const projectClassification = deriveProjectClassification(parsed.data.specificClassificationType);
  const projectType = deriveProjectType(projectClassification);
  const nextFundingType = parsed.data.fundingType ?? existing.businessCase?.introduction.fundingType ?? "";
  const nextFundingSource = parsed.data.fundingSource ?? existing.businessCase?.introduction.fundingSource ?? "";

  const nextState = {
    category: parsed.data.category,
    projectTheme: parsed.data.projectTheme,
    strategicObjective: parsed.data.strategicObjective,
    specificClassificationType: parsed.data.specificClassificationType,
    enterpriseProjectTheme: parsed.data.enterpriseProjectTheme,
    portfolioEsc: parsed.data.portfolioEsc ?? existing.portfolioEsc ?? "",
    projectClassification,
    projectType
  };

  const hasCharacteristicsUpdate =
    existing.category !== nextState.category ||
    (existing.projectTheme ?? "") !== nextState.projectTheme ||
    (existing.strategicObjective ?? "") !== nextState.strategicObjective ||
    (existing.specificClassificationType ?? "") !== nextState.specificClassificationType ||
    (existing.enterpriseProjectTheme ?? "") !== nextState.enterpriseProjectTheme ||
    (existing.portfolioEsc ?? "") !== nextState.portfolioEsc ||
    (existing.projectClassification ?? "") !== nextState.projectClassification ||
    (existing.projectType ?? "") !== nextState.projectType ||
    (existing.businessCase?.introduction.fundingType ?? "") !== nextFundingType ||
    (existing.businessCase?.introduction.fundingSource ?? "") !== nextFundingSource;

  let updated: Awaited<ReturnType<typeof updateSubmission>> | null = existing;
  if (hasCharacteristicsUpdate) {
    try {
      const saved = await updateSubmission(
        id,
        {
          ...nextState,
          businessCase: {
            introduction: {
              fundingType: nextFundingType,
              fundingSource: nextFundingSource
            }
          }
        },
        {
          audit: {
            action: "UPDATED",
            note: "Governance characteristics updated.",
            actorName: principal.name ?? "Governance Reviewer",
            actorEmail: principal.email ?? undefined
          }
        }
      );
      updated = saved;
    } catch (error) {
      return persistenceErrorResponse(error, "Failed to save governance characteristics.");
    }
  }

  if (!updated) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  if (hasCharacteristicsUpdate) {
    try {
      await markGovernanceCharacteristicsUpdated(id);
    } catch (error) {
      return persistenceErrorResponse(error, "Failed to mark governance task update.");
    }
    try {
      await appendGovernanceAuditLog({
        area: "WORKFLOW",
        action: "UPDATE_CHARACTERISTICS",
        entityType: "submission",
        entityId: updated.id,
        outcome: "SUCCESS",
        actorName: principal.name ?? "Governance Reviewer",
        actorEmail: principal.email ?? undefined,
        actorRole: principal.roleType,
        details: "Characteristics updated during governance review.",
        metadata: {
          stage: updated.stage,
          status: updated.status
        }
      });
    } catch {
      // Non-blocking audit write.
    }
  }

  return NextResponse.json({ data: updated, meta: { characteristicsUpdated: hasCharacteristicsUpdate } });
}
