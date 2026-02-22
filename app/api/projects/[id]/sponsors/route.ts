import { NextResponse } from "next/server";
import { z } from "zod";

import { persistenceErrorResponse } from "@/lib/api/error-response";
import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { canUserEditSubmission, canUserViewSubmission } from "@/lib/auth/project-access";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";
import { getSubmissionById, reconcileSubmissionWorkflow, updateSubmissionSponsors } from "@/lib/submissions/store";
import type { SponsorContacts } from "@/lib/submissions/types";

const personSchema = z
  .object({
    azureObjectId: z.string().min(1).max(200),
    displayName: z.string().min(1).max(200),
    email: z.string().email(),
    jobTitle: z.string().max(200).optional(),
    photoUrl: z.string().url().optional()
  })
  .nullable();

const sponsorsSchema = z.object({
  businessSponsor: personSchema.optional(),
  businessDelegate: personSchema.optional(),
  technologySponsor: personSchema.optional(),
  financeSponsor: personSchema.optional(),
  benefitsSponsor: personSchema.optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("projects");
  if ("error" in access) {
    return access.error;
  }
  const principal = access.principal;
  const rbacUser = toRbacPrincipal(principal);

  const { id } = await context.params;
  let current: Awaited<ReturnType<typeof getSubmissionById>> = null;
  try {
    current = await getSubmissionById(id);
  } catch (error) {
    return persistenceErrorResponse(error, "Failed to load submission sponsors.");
  }
  if (!current) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (!canUserViewSubmission(rbacUser, current, "projects")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (!canUserEditSubmission(rbacUser, current)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = sponsorsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  let updated: Awaited<ReturnType<typeof updateSubmissionSponsors>> = null;
  try {
    updated = await updateSubmissionSponsors(id, parsed.data as SponsorContacts, {
      actorName: principal.name ?? "Portal User",
      actorEmail: principal.email ?? undefined
    });
  } catch (error) {
    return persistenceErrorResponse(error, "Failed to update project sponsors.");
  }
  if (!updated) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  let reconciled: Awaited<ReturnType<typeof reconcileSubmissionWorkflow>> = null;
  try {
    reconciled = await reconcileSubmissionWorkflow(id, {
      actorName: principal.name ?? "Portal User",
      actorEmail: principal.email ?? undefined,
      reason: "Reconciled workflow after sponsor update."
    });
  } catch (error) {
    return persistenceErrorResponse(error, "Failed to reconcile workflow after sponsor update.");
  }
  const responseData = reconciled ?? updated;

  try {
    await appendGovernanceAuditLog({
      area: "WORKFLOW",
      action: "UPDATE_PROJECT_SPONSORS",
      entityType: "submission",
      entityId: responseData.id,
      outcome: "SUCCESS",
      actorName: principal.name ?? "Portal User",
      actorEmail: principal.email ?? undefined,
      actorRole: principal.roleType,
      details: "Project sponsor assignments updated and approvals recalculated.",
      metadata: {
        oldBusinessSponsor: current.sponsorContacts?.businessSponsor?.email ?? current.sponsorEmail ?? null,
        newBusinessSponsor: responseData.sponsorContacts?.businessSponsor?.email ?? responseData.sponsorEmail ?? null
      }
    });
  } catch {
    // Non-blocking audit write.
  }

  return NextResponse.json({ data: responseData });
}
