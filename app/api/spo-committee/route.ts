import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiPrincipal } from "@/lib/auth/api";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";
import { listSpoCommitteeState, saveSpoCommitteeRows } from "@/lib/spo-committee/store";

const updateSchema = z.object({
  rows: z.array(
    z.object({
      projectId: z.string().min(1),
      decision: z.union([
        z.literal(""),
        z.literal("Deferred"),
        z.literal("Approved"),
        z.literal("Request Additional Action")
      ]),
      comment: z.string().max(2000)
    })
  )
});

const requireSpoCommitteeAccess = async () => {
  const access = await requireApiPrincipal("spo_committee_hub");
  if ("error" in access) {
    return access;
  }

  return access;
};

export async function GET() {
  const access = await requireSpoCommitteeAccess();
  if ("error" in access) {
    return access.error;
  }

  const data = await listSpoCommitteeState();
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const access = await requireSpoCommitteeAccess();
  if ("error" in access) {
    return access.error;
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const data = await saveSpoCommitteeRows(parsed.data.rows, {
    name: access.principal.name ?? "Portal User",
    email: access.principal.email ?? "unknown@portal.local"
  });

  try {
    await appendGovernanceAuditLog({
      area: "SPO_COMMITTEE",
      action: "SAVE_SPO_COMMITTEE_ROWS",
      entityType: "spo-committee",
      outcome: "SUCCESS",
      actorName: access.principal.name ?? "Portal User",
      actorEmail: access.principal.email ?? undefined,
      actorRole: access.principal.roleType,
      details: "SPO Committee decisions/comments saved.",
      metadata: {
        rowCount: parsed.data.rows.length
      }
    });
  } catch {
    // Non-blocking audit write.
  }

  return NextResponse.json({ data });
}
