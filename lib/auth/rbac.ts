import type { RoleType } from "@/lib/auth/roles";
import { normalizeRoleType } from "@/lib/auth/roles";

export const MODULE_NAMES = [
  "projects",
  "dashboard",
  "stratos_lab",
  "finance_governance_hub",
  "project_governance_hub",
  "spo_committee_hub",
  "project_management_hub",
  "user_admin"
] as const;

export type ModuleName = (typeof MODULE_NAMES)[number];
export type VisibilityScope = "OWN" | "ASSIGNED" | "ALL" | "NONE";
export type ApprovalStage = "BUSINESS" | "TECHNOLOGY" | "FINANCE" | "BENEFITS" | "PROJECT_MANAGER";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "NEED_MORE_INFO";
export type ApprovalActingAs = "SPONSOR" | "DELEGATE";

export type RbacUser = {
  id?: string | null;
  email?: string | null;
  azureObjectId?: string | null;
  roleType?: RoleType | string | null;
  isActive?: boolean | null;
};

export type ProjectAssignmentPrincipal = {
  userId?: string | null;
  userEmail?: string | null;
  userAzureObjectId?: string | null;
};

export type ProjectAccessTarget = {
  id: string;
  createdByUserId?: string | null;
  ownerEmail?: string | null;
  assignments?: ProjectAssignmentPrincipal[];
  businessSponsorObjectId?: string | null;
  businessSponsorEmail?: string | null;
  businessDelegateObjectId?: string | null;
  businessDelegateEmail?: string | null;
  technologySponsorObjectId?: string | null;
  technologySponsorEmail?: string | null;
  financeSponsorObjectId?: string | null;
  financeSponsorEmail?: string | null;
  benefitsSponsorObjectId?: string | null;
  benefitsSponsorEmail?: string | null;
};

type RolePolicy = {
  projects: VisibilityScope;
  dashboard: VisibilityScope;
  stratosLab: VisibilityScope;
  financeHub: boolean;
  projectGovHub: boolean;
  spoHub: boolean;
  pmHub: boolean;
  userAdmin: boolean;
};

const policyByRole: Record<RoleType, RolePolicy> = {
  BASIC_USER: {
    projects: "OWN",
    dashboard: "OWN",
    stratosLab: "OWN",
    financeHub: false,
    projectGovHub: false,
    spoHub: false,
    pmHub: false,
    userAdmin: false
  },
  FINANCE_GOVERNANCE_USER: {
    projects: "OWN",
    dashboard: "ALL",
    stratosLab: "ALL",
    financeHub: true,
    projectGovHub: false,
    spoHub: false,
    pmHub: false,
    userAdmin: false
  },
  PROJECT_GOVERNANCE_USER: {
    projects: "OWN",
    dashboard: "ALL",
    stratosLab: "ALL",
    financeHub: false,
    projectGovHub: true,
    spoHub: false,
    pmHub: false,
    userAdmin: false
  },
  SPO_COMMITTEE_HUB_USER: {
    projects: "OWN",
    dashboard: "ALL",
    stratosLab: "ALL",
    financeHub: false,
    projectGovHub: false,
    spoHub: true,
    pmHub: false,
    userAdmin: false
  },
  PROJECT_MANAGEMENT_HUB_ADMIN: {
    projects: "ALL",
    dashboard: "ALL",
    stratosLab: "ALL",
    financeHub: false,
    projectGovHub: false,
    spoHub: false,
    pmHub: true,
    userAdmin: false
  },
  PROJECT_MANAGEMENT_HUB_BASIC_USER: {
    projects: "ASSIGNED",
    dashboard: "ASSIGNED",
    stratosLab: "ASSIGNED",
    financeHub: false,
    projectGovHub: false,
    spoHub: false,
    pmHub: true,
    userAdmin: false
  },
  ADMIN: {
    projects: "ALL",
    dashboard: "ALL",
    stratosLab: "ALL",
    financeHub: true,
    projectGovHub: true,
    spoHub: true,
    pmHub: true,
    userAdmin: true
  }
};

const normalizeEmail = (value?: string | null) => (value ?? "").trim().toLowerCase();
const normalizeId = (value?: string | null) => (value ?? "").trim();

const getRolePolicy = (user: RbacUser): RolePolicy => {
  const normalizedRole = normalizeRoleType(user.roleType);
  return policyByRole[normalizedRole];
};

const isActiveUser = (user: RbacUser) => user.isActive !== false;

const isProjectOwner = (user: RbacUser, project: ProjectAccessTarget) => {
  const userId = normalizeId(user.id);
  const createdByUserId = normalizeId(project.createdByUserId);
  if (userId && createdByUserId && userId === createdByUserId) {
    return true;
  }

  const userEmail = normalizeEmail(user.email);
  const ownerEmail = normalizeEmail(project.ownerEmail);
  return Boolean(userEmail && ownerEmail && userEmail === ownerEmail);
};

const isProjectAssignee = (user: RbacUser, project: ProjectAccessTarget) => {
  if (!Array.isArray(project.assignments) || project.assignments.length === 0) {
    return false;
  }

  const userId = normalizeId(user.id);
  const userEmail = normalizeEmail(user.email);
  const userObjectId = normalizeId(user.azureObjectId);

  return project.assignments.some((assignment) => {
    const assignmentUserId = normalizeId(assignment.userId);
    const assignmentEmail = normalizeEmail(assignment.userEmail);
    const assignmentObjectId = normalizeId(assignment.userAzureObjectId);

    return Boolean(
      (userId && assignmentUserId && userId === assignmentUserId) ||
        (userEmail && assignmentEmail && userEmail === assignmentEmail) ||
        (userObjectId && assignmentObjectId && userObjectId === assignmentObjectId)
    );
  });
};

const isDesignatedPerson = (
  user: RbacUser,
  person: { objectId?: string | null; email?: string | null } | null
) => {
  if (!person) {
    return false;
  }
  const userObjectId = normalizeId(user.azureObjectId);
  const personObjectId = normalizeId(person.objectId);
  if (userObjectId && personObjectId && userObjectId === personObjectId) {
    return true;
  }

  const userEmail = normalizeEmail(user.email);
  const personEmail = normalizeEmail(person.email);
  return Boolean(userEmail && personEmail && userEmail === personEmail);
};

const isSponsorOrDelegateForProject = (user: RbacUser, project: ProjectAccessTarget) => {
  return (
    isDesignatedPerson(user, {
      objectId: project.businessSponsorObjectId,
      email: project.businessSponsorEmail
    }) ||
    isDesignatedPerson(user, {
      objectId: project.businessDelegateObjectId,
      email: project.businessDelegateEmail
    }) ||
    isDesignatedPerson(user, {
      objectId: project.technologySponsorObjectId,
      email: project.technologySponsorEmail
    }) ||
    isDesignatedPerson(user, {
      objectId: project.financeSponsorObjectId,
      email: project.financeSponsorEmail
    }) ||
    isDesignatedPerson(user, {
      objectId: project.benefitsSponsorObjectId,
      email: project.benefitsSponsorEmail
    })
  );
};

export const projectVisibilityScope = (user: RbacUser, moduleName: ModuleName = "projects"): VisibilityScope => {
  const policy = getRolePolicy(user);
  if (moduleName === "projects") return policy.projects;
  if (moduleName === "dashboard") return policy.dashboard;
  if (moduleName === "stratos_lab") return policy.stratosLab;
  return "NONE";
};

export const canAccessModule = (user: RbacUser, moduleName: ModuleName): boolean => {
  if (!isActiveUser(user)) {
    return false;
  }

  const policy = getRolePolicy(user);
  switch (moduleName) {
    case "projects":
      return policy.projects !== "NONE";
    case "dashboard":
      return policy.dashboard !== "NONE";
    case "stratos_lab":
      return policy.stratosLab !== "NONE";
    case "finance_governance_hub":
      return policy.financeHub;
    case "project_governance_hub":
      return policy.projectGovHub;
    case "spo_committee_hub":
      return policy.spoHub;
    case "project_management_hub":
      return policy.pmHub;
    case "user_admin":
      return policy.userAdmin;
    default:
      return false;
  }
};

export const canViewProject = (
  user: RbacUser,
  project: ProjectAccessTarget,
  moduleName: ModuleName = "projects"
): boolean => {
  if (!isActiveUser(user)) {
    return false;
  }

  // Dynamic project-scoped sponsor/delegate entitlement.
  if (isSponsorOrDelegateForProject(user, project)) {
    return true;
  }

  const scope = projectVisibilityScope(user, moduleName);
  if (scope === "ALL") return true;
  if (scope === "OWN") return isProjectOwner(user, project);
  if (scope === "ASSIGNED") return isProjectAssignee(user, project);
  return false;
};

export const canEditProject = (user: RbacUser, project: ProjectAccessTarget): boolean => {
  if (!isActiveUser(user)) {
    return false;
  }

  const role = normalizeRoleType(user.roleType);
  if (role === "ADMIN" || role === "PROJECT_MANAGEMENT_HUB_ADMIN") {
    return true;
  }

  // Submitter edit rights are owner-scoped only.
  return isProjectOwner(user, project);
};

export const getProjectApprovalActingAs = (
  user: RbacUser,
  project: ProjectAccessTarget,
  stage: ApprovalStage
): ApprovalActingAs | null => {
  if (!isActiveUser(user)) {
    return null;
  }

  if (stage === "BUSINESS") {
    const isSponsor = isDesignatedPerson(user, {
      objectId: project.businessSponsorObjectId,
      email: project.businessSponsorEmail
    });
    if (isSponsor) {
      return "SPONSOR";
    }

    const isDelegate = isDesignatedPerson(user, {
      objectId: project.businessDelegateObjectId,
      email: project.businessDelegateEmail
    });
    return isDelegate ? "DELEGATE" : null;
  }

  if (stage === "TECHNOLOGY") {
    return isDesignatedPerson(user, {
      objectId: project.technologySponsorObjectId,
      email: project.technologySponsorEmail
    })
      ? "SPONSOR"
      : null;
  }

  if (stage === "FINANCE") {
    return isDesignatedPerson(user, {
      objectId: project.financeSponsorObjectId,
      email: project.financeSponsorEmail
    })
      ? "SPONSOR"
      : null;
  }

  if (stage === "BENEFITS") {
    return isDesignatedPerson(user, {
      objectId: project.benefitsSponsorObjectId,
      email: project.benefitsSponsorEmail
    })
      ? "SPONSOR"
      : null;
  }

  if (stage === "PROJECT_MANAGER") {
    const ownerMatch = isDesignatedPerson(user, {
      email: project.ownerEmail
    });
    return ownerMatch || isProjectAssignee(user, project) ? "SPONSOR" : null;
  }

  return null;
};

export const canApproveProject = (
  user: RbacUser,
  project: ProjectAccessTarget,
  stage:
    | ApprovalStage
    | {
        stage: ApprovalStage;
        status?: ApprovalStatus | null;
      }
): boolean => {
  if (!isActiveUser(user)) {
    return false;
  }

  const role = normalizeRoleType(user.roleType);
  const stageCode = typeof stage === "string" ? stage : stage.stage;
  const status = typeof stage === "string" ? undefined : stage.status;

  if (status && status !== "PENDING" && status !== "NEED_MORE_INFO") {
    return false;
  }

  if (role === "ADMIN") {
    return true;
  }

  return getProjectApprovalActingAs(user, project, stageCode) !== null;
};
