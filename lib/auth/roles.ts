export const ROLE_TYPES = [
  "BASIC_USER",
  "FINANCE_GOVERNANCE_USER",
  "PROJECT_GOVERNANCE_USER",
  "SPO_COMMITTEE_HUB_USER",
  "PROJECT_MANAGEMENT_HUB_ADMIN",
  "PROJECT_MANAGEMENT_HUB_BASIC_USER",
  "ADMIN"
] as const;

export type RoleType = (typeof ROLE_TYPES)[number];

// Backward-compatible aliases used across the current codebase.
export const ROLES = ROLE_TYPES;
export type Role = RoleType;

const legacyRoleMap: Record<string, RoleType> = {
  SUBMITTER: "BASIC_USER",
  REVIEWER: "PROJECT_GOVERNANCE_USER",
  APPROVER: "FINANCE_GOVERNANCE_USER",
  ADMIN: "ADMIN"
};

export const normalizeRoleType = (value?: string | null): RoleType => {
  if (!value) {
    return "BASIC_USER";
  }
  if ((ROLE_TYPES as readonly string[]).includes(value)) {
    return value as RoleType;
  }
  return legacyRoleMap[value] ?? "BASIC_USER";
};

export const roleLabels: Record<RoleType, string> = {
  BASIC_USER: "Basic User",
  FINANCE_GOVERNANCE_USER: "Finance Governance User",
  PROJECT_GOVERNANCE_USER: "Project Governance User",
  SPO_COMMITTEE_HUB_USER: "SPO Committee Hub User",
  PROJECT_MANAGEMENT_HUB_ADMIN: "Project Management Hub Admin",
  PROJECT_MANAGEMENT_HUB_BASIC_USER: "Project Management Hub Basic User",
  ADMIN: "Admin"
};

export const canViewAdmin = (role?: RoleType | string | null): boolean =>
  normalizeRoleType(role) === "ADMIN";
