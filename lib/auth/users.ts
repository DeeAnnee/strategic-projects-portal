import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { FUNCTION_RIGHTS, type FunctionAccess, type FunctionRight } from "@/lib/auth/access-config";
import type { RoleType } from "@/lib/auth/roles";
import { normalizeRoleType } from "@/lib/auth/roles";
import { canAccessModule, projectVisibilityScope } from "@/lib/auth/rbac";
import { isStagingAppEnv } from "@/lib/runtime/app-env";
import { STAGING_TEST_ACCOUNTS, type TestAccount } from "@/lib/staging/test-accounts";

export type PortalUser = {
  id: string;
  azureObjectId: string;
  name: string;
  email: string;
  password: string;
  jobTitle: string;
  department: string;
  roleType: RoleType;
  isActive: boolean;
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type SafePortalUser = Omit<PortalUser, "password"> & {
  roleType: RoleType;
  role: RoleType;
};

type LegacyUserShape = {
  id?: string;
  azure_object_id?: string;
  azureObjectId?: string;
  name?: string;
  email?: string;
  password?: string;
  job_title?: string;
  jobTitle?: string;
  department?: string;
  role_type?: string;
  roleType?: string;
  role?: string;
  functionAccess?: unknown;
  is_active?: boolean;
  isActive?: boolean;
  photo_url?: string;
  photoUrl?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
};

const storeFile = path.join(process.cwd(), "data", "users.json");
let inMemoryUsers: PortalUser[] | null = null;

const nowIso = () => new Date().toISOString();
const normalizeEmail = (value?: string | null) => (value ?? "").trim().toLowerCase();
const normalizeText = (value?: string | null) => (value ?? "").trim();

const isReadonlyFsError = (error: unknown) => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  const code = String((error as NodeJS.ErrnoException).code ?? "");
  return code === "EROFS" || code === "EACCES" || code === "EPERM";
};

const deriveAzureObjectId = (row: LegacyUserShape, email: string, id: string) =>
  normalizeText(row.azure_object_id) || normalizeText(row.azureObjectId) || `legacy-${email || id}`;

const normalizeUser = (row: LegacyUserShape): PortalUser => {
  const email = normalizeEmail(row.email);
  const id = normalizeText(row.id) || `u-${randomUUID()}`;
  const createdAt = normalizeText(row.created_at) || normalizeText(row.createdAt) || nowIso();
  const updatedAt = normalizeText(row.updated_at) || normalizeText(row.updatedAt) || createdAt;

  return {
    id,
    azureObjectId: deriveAzureObjectId(row, email, id),
    name: normalizeText(row.name) || email || "Portal User",
    email,
    password: normalizeText(row.password) || "password123",
    jobTitle: normalizeText(row.job_title) || normalizeText(row.jobTitle),
    department: normalizeText(row.department),
    roleType: normalizeRoleType(row.role_type ?? row.roleType ?? row.role),
    isActive: row.is_active ?? row.isActive ?? true,
    photoUrl: normalizeText(row.photo_url) || normalizeText(row.photoUrl) || undefined,
    createdAt,
    updatedAt
  };
};

const toSafeUser = (user: PortalUser): SafePortalUser => {
  const safe = { ...user } as Omit<PortalUser, "password"> & { password?: string };
  delete safe.password;
  return {
    ...safe,
    roleType: user.roleType,
    role: user.roleType
  };
};

const accountToPortalUser = (account: TestAccount, createdAt: string): PortalUser => ({
  id: `u-${account.key}`,
  azureObjectId: account.azureObjectId,
  name: account.name,
  email: normalizeEmail(account.email),
  password: account.password,
  jobTitle: account.jobTitle,
  department: account.department,
  roleType: account.roleType,
  isActive: true,
  createdAt,
  updatedAt: createdAt
});

const seedUsers = (): PortalUser[] => {
  const createdAt = nowIso();
  const mk = (
    id: string,
    azureObjectId: string,
    name: string,
    email: string,
    roleType: RoleType,
    jobTitle: string,
    department: string
  ): PortalUser => ({
    id,
    azureObjectId,
    name,
    email,
    password: "password123",
    jobTitle,
    department,
    roleType,
    isActive: true,
    createdAt,
    updatedAt: createdAt
  });

  return [
    mk(
      "u-basic-001",
      "11111111-1111-1111-1111-111111111111",
      "Sofia Submitter",
      "submitter@portal.local",
      "BASIC_USER",
      "Project Analyst",
      "Transformation"
    ),
    mk(
      "u-finance-001",
      "22222222-2222-2222-2222-222222222222",
      "Avery Approver",
      "approver@portal.local",
      "FINANCE_GOVERNANCE_USER",
      "Finance Director",
      "Finance"
    ),
    mk(
      "u-gov-001",
      "33333333-3333-3333-3333-333333333333",
      "Ravi Reviewer",
      "reviewer@portal.local",
      "PROJECT_GOVERNANCE_USER",
      "Governance Manager",
      "Governance"
    ),
    mk(
      "u-spo-001",
      "44444444-4444-4444-4444-444444444444",
      "Selene SPO",
      "spo@portal.local",
      "SPO_COMMITTEE_HUB_USER",
      "SPO Analyst",
      "SPO Committee"
    ),
    mk(
      "u-pm-admin-001",
      "55555555-5555-5555-5555-555555555555",
      "Morgan PM Admin",
      "pmadmin@portal.local",
      "PROJECT_MANAGEMENT_HUB_ADMIN",
      "PMO Lead",
      "Project Management"
    ),
    mk(
      "u-pm-basic-001",
      "66666666-6666-6666-6666-666666666666",
      "Jordan PM User",
      "pmbasic@portal.local",
      "PROJECT_MANAGEMENT_HUB_BASIC_USER",
      "Project Manager",
      "Project Management"
    ),
    mk(
      "u-admin-001",
      "77777777-7777-7777-7777-777777777777",
      "Ada Admin",
      "admin@portal.local",
      "ADMIN",
      "System Administrator",
      "Technology"
    )
  ];
};

const seedStagingUsers = (): PortalUser[] => {
  const createdAt = nowIso();
  return STAGING_TEST_ACCOUNTS.map((account) => accountToPortalUser(account, createdAt));
};

const writeStore = async (users: PortalUser[]) => {
  inMemoryUsers = users.map((user) => ({ ...user }));
  try {
    await fs.writeFile(storeFile, JSON.stringify(users, null, 2), "utf8");
  } catch (error) {
    if (!isReadonlyFsError(error)) {
      throw error;
    }
  }
};

const mergeMissingStagingUsers = async (users: PortalUser[]) => {
  if (!isStagingAppEnv()) {
    return users;
  }

  const existingEmails = new Set(users.map((user) => normalizeEmail(user.email)));
  const createdAt = nowIso();
  let changed = false;
  const next = [...users];

  for (const account of STAGING_TEST_ACCOUNTS) {
    const email = normalizeEmail(account.email);
    if (existingEmails.has(email)) {
      continue;
    }
    next.push(accountToPortalUser(account, createdAt));
    existingEmails.add(email);
    changed = true;
  }

  if (changed) {
    await writeStore(next);
  }

  return next;
};

const readStore = async (): Promise<PortalUser[]> => {
  if (inMemoryUsers) {
    return mergeMissingStagingUsers(inMemoryUsers.map((user) => ({ ...user })));
  }

  try {
    const raw = await fs.readFile(storeFile, "utf8");
    const parsed = JSON.parse(raw) as LegacyUserShape[];
    if (Array.isArray(parsed)) {
      const normalized = parsed.map(normalizeUser);
      inMemoryUsers = normalized.map((user) => ({ ...user }));
      return mergeMissingStagingUsers(normalized);
    }
    const seeded = isStagingAppEnv() ? seedStagingUsers() : seedUsers();
    await writeStore(seeded);
    return seeded;
  } catch {
    const seeded = isStagingAppEnv() ? seedStagingUsers() : seedUsers();
    await writeStore(seeded);
    return seeded;
  }
};

export const listUsers = async (): Promise<PortalUser[]> => readStore();

export const listUsersSafe = async (): Promise<SafePortalUser[]> => {
  const users = await readStore();
  return users.map(toSafeUser);
};

export const findDemoUser = async (email: string, password: string): Promise<PortalUser | null> => {
  const users = await readStore();
  const found = users.find(
    (user) =>
      user.email === normalizeEmail(email) &&
      user.password === password &&
      user.isActive
  );
  return found ?? null;
};

export const findUserByEmail = async (email?: string | null): Promise<PortalUser | null> => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }
  const users = await readStore();
  return users.find((user) => user.email === normalizedEmail) ?? null;
};

export const findUserById = async (id?: string | null): Promise<PortalUser | null> => {
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return null;
  }
  const users = await readStore();
  return users.find((user) => user.id === normalizedId) ?? null;
};

export const findUserByAzureObjectId = async (
  azureObjectId?: string | null
): Promise<PortalUser | null> => {
  const normalizedObjectId = normalizeText(azureObjectId);
  if (!normalizedObjectId) {
    return null;
  }
  const users = await readStore();
  return users.find((user) => user.azureObjectId === normalizedObjectId) ?? null;
};

export const createUser = async (input: {
  azureObjectId?: string;
  name: string;
  email: string;
  password: string;
  jobTitle?: string;
  department?: string;
  roleType?: RoleType;
  role?: RoleType;
  isActive?: boolean;
  photoUrl?: string;
}) => {
  const users = await readStore();
  const email = normalizeEmail(input.email);
  const existing = users.find((user) => user.email === email);
  if (existing) {
    return null;
  }

  const now = nowIso();
  const created: PortalUser = {
    id: `u-${randomUUID()}`,
    azureObjectId: normalizeText(input.azureObjectId) || randomUUID(),
    name: normalizeText(input.name),
    email,
    password: input.password,
    jobTitle: normalizeText(input.jobTitle),
    department: normalizeText(input.department),
    roleType: normalizeRoleType(input.roleType ?? input.role),
    isActive: input.isActive ?? true,
    photoUrl: normalizeText(input.photoUrl) || undefined,
    createdAt: now,
    updatedAt: now
  };

  users.push(created);
  await writeStore(users);
  return toSafeUser(created);
};

export const updateUserRole = async (id: string, roleType: RoleType) => {
  const users = await readStore();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) {
    return null;
  }

  const updated: PortalUser = {
    ...users[index],
    roleType: normalizeRoleType(roleType),
    updatedAt: nowIso()
  };

  users[index] = updated;
  await writeStore(users);
  return toSafeUser(updated);
};

export const updateUserActive = async (id: string, isActive: boolean) => {
  const users = await readStore();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) {
    return null;
  }

  const updated: PortalUser = {
    ...users[index],
    isActive,
    updatedAt: nowIso()
  };

  users[index] = updated;
  await writeStore(users);
  return toSafeUser(updated);
};

export const updateUserProfile = async (
  id: string,
  patch: {
    name?: string;
    email?: string;
    jobTitle?: string;
    department?: string;
    photoUrl?: string;
  }
) => {
  const users = await readStore();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) {
    return null;
  }

  const current = users[index];
  const nextEmail =
    patch.email === undefined
      ? current.email
      : normalizeEmail(patch.email) || current.email;

  const duplicate = users.some((user, rowIndex) => rowIndex !== index && user.email === nextEmail);
  if (duplicate) {
    throw new Error("A user with that email already exists.");
  }

  const updated: PortalUser = {
    ...current,
    name: patch.name === undefined ? current.name : normalizeText(patch.name) || current.name,
    email: nextEmail,
    jobTitle: patch.jobTitle === undefined ? current.jobTitle : normalizeText(patch.jobTitle),
    department: patch.department === undefined ? current.department : normalizeText(patch.department),
    photoUrl: patch.photoUrl === undefined ? current.photoUrl : normalizeText(patch.photoUrl) || undefined,
    updatedAt: nowIso()
  };

  users[index] = updated;
  await writeStore(users);
  return toSafeUser(updated);
};

// Backward-compatible adapter used by old API surface while routes are being migrated.
export const updateUserRoleAndAccess = async (
  email: string,
  patch: {
    role?: RoleType;
    roleType?: RoleType;
    functionAccess?: unknown;
  }
) => {
  const user = await findUserByEmail(email);
  if (!user) {
    return null;
  }
  const nextRole = patch.roleType ?? patch.role ?? user.roleType;
  return updateUserRole(user.id, nextRole);
};

export const getDefaultFunctionAccess = (roleType?: RoleType | string | null): FunctionAccess => {
  const normalizedRole = normalizeRoleType(roleType);
  const user = { roleType: normalizedRole, isActive: true };
  const projectScope = projectVisibilityScope(user, "projects");

  const rights: FunctionAccess = {
    manage_reference_data: canAccessModule(user, "user_admin"),
    manage_user_rights: canAccessModule(user, "user_admin"),
    run_workflow_actions:
      canAccessModule(user, "finance_governance_hub") ||
      canAccessModule(user, "project_governance_hub") ||
      canAccessModule(user, "spo_committee_hub") ||
      canAccessModule(user, "project_management_hub") ||
      canAccessModule(user, "user_admin"),
    sponsor_decision: true,
    export_reports: canAccessModule(user, "dashboard") || canAccessModule(user, "stratos_lab"),
    view_all_submissions: projectScope === "ALL"
  };

  const normalized = {} as FunctionAccess;
  for (const right of FUNCTION_RIGHTS) {
    normalized[right] = rights[right];
  }
  return normalized;
};

export type { FunctionRight };
