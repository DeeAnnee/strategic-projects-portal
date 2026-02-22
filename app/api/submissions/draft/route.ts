import { NextResponse } from "next/server";

import { projectVisibilityScope } from "@/lib/auth/rbac";
import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";
import { draftSubmissionSchema } from "@/lib/submissions/schema";
import { createDraftSubmission } from "@/lib/submissions/store";

export async function POST(request: Request) {
  const access = await requireApiPrincipal("projects");
  if ("error" in access) {
    return access.error;
  }

  const visibility = projectVisibilityScope(toRbacPrincipal(access.principal), "projects");
  if (visibility === "ASSIGNED" || visibility === "NONE") {
    return NextResponse.json(
      { message: "Your role has read-only project visibility and cannot create drafts." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = draftSubmissionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Validation failed",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const created = await createDraftSubmission({
    ...parsed.data,
    createdByUserId: access.principal.id,
    ownerName: access.principal.name ?? parsed.data.ownerName,
    ownerEmail: access.principal.email ?? parsed.data.ownerEmail
  });

  try {
    await appendGovernanceAuditLog({
      area: "SUBMISSIONS",
      action: "CREATE_DRAFT_SUBMISSION",
      entityType: "submission",
      entityId: created.id,
      outcome: "SUCCESS",
      actorName: access.principal.name ?? "Portal User",
      actorEmail: access.principal.email ?? undefined,
      actorRole: access.principal.roleType,
      details: "Draft submission created through /api/submissions/draft."
    });
  } catch {
    // Non-blocking audit write.
  }

  return NextResponse.json({ data: created }, { status: 201 });
}
