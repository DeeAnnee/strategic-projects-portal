import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiPrincipal } from "@/lib/auth/api";
import { ROLE_TYPES, type RoleType } from "@/lib/auth/roles";
import {
  createUser,
  listUsersSafe,
  updateUserProfile,
  updateUserActive,
  updateUserRole
} from "@/lib/auth/users";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const roleEnum = z.enum(ROLE_TYPES as unknown as [RoleType, ...RoleType[]]);

const patchSchema = z
  .object({
    id: z.string().optional(),
    email: z.string().email().optional(),
    name: z.string().trim().min(1).optional(),
    jobTitle: z.string().max(200).optional(),
    department: z.string().max(200).optional(),
    photoUrl: z.string().url().optional(),
    roleType: roleEnum.optional(),
    role: roleEnum.optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => Boolean(value.id || value.email), {
    message: "id or email is required",
    path: ["id"]
  });

const postSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  azureObjectId: z.string().min(1).optional(),
  roleType: roleEnum.optional(),
  role: roleEnum.optional(),
  isActive: z.boolean().optional(),
  jobTitle: z.string().max(200).optional(),
  department: z.string().max(200).optional(),
  photoUrl: z.string().url().optional()
});

const requireAdminAccess = async () => {
  const access = await requireApiPrincipal("user_admin");
  if ("error" in access) {
    return access;
  }
  return access;
};

export async function GET() {
  const access = await requireAdminAccess();
  if ("error" in access) {
    return access.error;
  }

  const users = await listUsersSafe();
  return NextResponse.json({ data: users });
}

export async function PATCH(request: Request) {
  const access = await requireAdminAccess();
  if ("error" in access) {
    return access.error;
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const currentUsers = await listUsersSafe();
  const targetUser =
    parsed.data.id && parsed.data.id.trim()
      ? currentUsers.find((user) => user.id === parsed.data.id)
      : currentUsers.find((user) => user.email === parsed.data.email?.toLowerCase());
  if (!targetUser) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  const nextRole = parsed.data.roleType ?? parsed.data.role;
  let updated = targetUser;

  if (nextRole) {
    const roleUpdated = await updateUserRole(updated.id, nextRole);
    if (!roleUpdated) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    updated = roleUpdated;
  }

  if (typeof parsed.data.isActive === "boolean") {
    const activeUpdated = await updateUserActive(updated.id, parsed.data.isActive);
    if (!activeUpdated) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    updated = activeUpdated;
  }

  const hasProfilePatch =
    parsed.data.name !== undefined ||
    parsed.data.email !== undefined ||
    parsed.data.jobTitle !== undefined ||
    parsed.data.department !== undefined ||
    parsed.data.photoUrl !== undefined;

  if (hasProfilePatch) {
    try {
      const profileUpdated = await updateUserProfile(updated.id, {
        name: parsed.data.name,
        email: parsed.data.email,
        jobTitle: parsed.data.jobTitle,
        department: parsed.data.department,
        photoUrl: parsed.data.photoUrl
      });
      if (!profileUpdated) {
        return NextResponse.json({ message: "User not found" }, { status: 404 });
      }
      updated = profileUpdated;
    } catch (profileError) {
      return NextResponse.json(
        { message: profileError instanceof Error ? profileError.message : "Failed to update user profile." },
        { status: 409 }
      );
    }
  }

  try {
    await appendGovernanceAuditLog({
      area: "ADMIN",
      action: "UPDATE_USER_ROLE",
      entityType: "user",
      entityId: updated.email,
      outcome: "SUCCESS",
      actorName: access.principal.name ?? "Admin",
      actorEmail: access.principal.email ?? undefined,
      actorRole: access.principal.roleType,
      details: `Updated user settings for ${updated.email}.`,
      metadata: {
        name: updated.name,
        roleType: updated.roleType,
        isActive: updated.isActive,
        jobTitle: updated.jobTitle || null,
        department: updated.department || null
      }
    });
  } catch {
    // Non-blocking audit write.
  }

  return NextResponse.json({ data: updated });
}

export async function POST(request: Request) {
  const access = await requireAdminAccess();
  if ("error" in access) {
    return access.error;
  }

  const body = await request.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const created = await createUser({
    azureObjectId: parsed.data.azureObjectId,
    name: parsed.data.name,
    email: parsed.data.email,
    password: parsed.data.password,
    roleType: parsed.data.roleType ?? parsed.data.role ?? "BASIC_USER",
    isActive: parsed.data.isActive ?? true,
    jobTitle: parsed.data.jobTitle,
    department: parsed.data.department,
    photoUrl: parsed.data.photoUrl
  });
  if (!created) {
    return NextResponse.json({ message: "A user with that email already exists." }, { status: 409 });
  }

  try {
    await appendGovernanceAuditLog({
      area: "ADMIN",
      action: "CREATE_USER",
      entityType: "user",
      entityId: created.email,
      outcome: "SUCCESS",
      actorName: access.principal.name ?? "Admin",
      actorEmail: access.principal.email ?? undefined,
      actorRole: access.principal.roleType,
      details: `Created new user ${created.email}.`,
      metadata: {
        roleType: created.roleType
      }
    });
  } catch {
    // Non-blocking audit write.
  }

  return NextResponse.json({ data: created }, { status: 201 });
}
