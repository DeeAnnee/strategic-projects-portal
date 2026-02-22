import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiPrincipal } from "@/lib/auth/api";
import { updateUserActive } from "@/lib/auth/users";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";

const activeSchema = z.object({
  isActive: z.boolean()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("user_admin");
  if ("error" in access) {
    return access.error;
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = activeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await updateUserActive(id, parsed.data.isActive);
  if (!updated) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  try {
    await appendGovernanceAuditLog({
      area: "ADMIN",
      action: "UPDATE_USER_ACTIVE",
      entityType: "user",
      entityId: updated.id,
      outcome: "SUCCESS",
      actorName: access.principal.name ?? "Admin",
      actorEmail: access.principal.email ?? undefined,
      actorRole: access.principal.roleType,
      details: `Set isActive=${String(updated.isActive)} for ${updated.email}.`
    });
  } catch {
    // Non-blocking audit write.
  }

  return NextResponse.json({ data: updated });
}
