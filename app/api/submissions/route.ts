import { NextResponse } from "next/server";

import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { filterSubmissionsByAccess } from "@/lib/auth/project-access";
import { projectVisibilityScope } from "@/lib/auth/rbac";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";
import { createSubmissionSchema } from "@/lib/submissions/schema";
import { createSubmission, listSubmissions } from "@/lib/submissions/store";

export async function GET() {
  const access = await requireApiPrincipal("projects");
  if ("error" in access) {
    return access.error;
  }

  const rows = await listSubmissions();
  const visibleRows = filterSubmissionsByAccess(toRbacPrincipal(access.principal), rows, "projects");
  return NextResponse.json({ data: visibleRows });
}

export async function POST(request: Request) {
  const access = await requireApiPrincipal("projects");
  if ("error" in access) {
    return access.error;
  }

  const visibility = projectVisibilityScope(toRbacPrincipal(access.principal), "projects");
  if (visibility === "ASSIGNED" || visibility === "NONE") {
    return NextResponse.json(
      { message: "Your role has read-only project visibility and cannot create submissions." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = createSubmissionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Validation failed",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const created = await createSubmission({
    ...parsed.data,
    createdByUserId: access.principal.id,
    ownerName: access.principal.name ?? parsed.data.ownerName,
    ownerEmail: access.principal.email ?? parsed.data.ownerEmail
  });

  try {
    await appendGovernanceAuditLog({
      area: "SUBMISSIONS",
      action: "CREATE_SUBMISSION",
      entityType: "submission",
      entityId: created.id,
      outcome: "SUCCESS",
      actorName: access.principal.name ?? "Portal User",
      actorEmail: access.principal.email ?? undefined,
      actorRole: access.principal.roleType,
      details: "Submission created through /api/submissions."
    });
  } catch {
    // Non-blocking audit write.
  }

  return NextResponse.json({ data: created }, { status: 201 });
}
