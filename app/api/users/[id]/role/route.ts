import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiPrincipal } from "@/lib/auth/api";
import { ROLE_TYPES, type RoleType } from "@/lib/auth/roles";
import { updateUserRole } from "@/lib/auth/users";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";

const roleSchema = z.object({
  roleType: z.enum(ROLE_TYPES as unknown as [RoleType, ...RoleType[]]).optional(),
  role: z.enum(ROLE_TYPES as unknown as [RoleType, ...RoleType[]]).optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("user_admin");
  if ("error" in access) {
    return access.error;
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = roleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const roleType = parsed.data.roleType ?? parsed.data.role;
  if (!roleType) {
    return NextResponse.json({ message: "roleType is required" }, { status: 400 });
  }

  const updated = await updateUserRole(id, roleType);
  if (!updated) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  try {
    await appendGovernanceAuditLog({
      area: "ADMIN",
      action: "UPDATE_USER_ROLE",
      entityType: "user",
      entityId: updated.id,
      outcome: "SUCCESS",
      actorName: access.principal.name ?? "Admin",
      actorEmail: access.principal.email ?? undefined,
      actorRole: access.principal.roleType,
      details: `Updated role for ${updated.email} to ${updated.roleType}.`
    });
  } catch {
    // Non-blocking audit write.
  }

  return NextResponse.json({ data: updated });
}
