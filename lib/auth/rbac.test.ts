import { describe, expect, it } from "vitest";

import {
  canAccessModule,
  canApproveProject,
  canEditProject,
  canViewProject,
  projectVisibilityScope,
  type ProjectAccessTarget,
  type RbacUser
} from "@/lib/auth/rbac";

const makeUser = (overrides: Partial<RbacUser>): RbacUser => ({
  id: "u-default",
  email: "default@portal.local",
  azureObjectId: "00000000-0000-0000-0000-000000000000",
  roleType: "BASIC_USER",
  isActive: true,
  ...overrides
});

const makeProject = (overrides: Partial<ProjectAccessTarget> = {}): ProjectAccessTarget => ({
  id: "SP-2026-001",
  createdByUserId: "u-owner",
  ownerEmail: "owner@portal.local",
  assignments: [],
  businessSponsorObjectId: undefined,
  businessSponsorEmail: undefined,
  businessDelegateObjectId: undefined,
  businessDelegateEmail: undefined,
  technologySponsorObjectId: undefined,
  technologySponsorEmail: undefined,
  financeSponsorObjectId: undefined,
  financeSponsorEmail: undefined,
  benefitsSponsorObjectId: undefined,
  benefitsSponsorEmail: undefined,
  ...overrides
});

describe("RBAC matrix", () => {
  it("Basic user sees only own projects", () => {
    const user = makeUser({
      id: "u-basic",
      email: "basic@portal.local",
      roleType: "BASIC_USER"
    });

    const own = makeProject({
      createdByUserId: "u-basic",
      ownerEmail: "basic@portal.local"
    });
    const other = makeProject({
      id: "SP-2026-002",
      createdByUserId: "u-other",
      ownerEmail: "other@portal.local"
    });

    expect(projectVisibilityScope(user, "projects")).toBe("OWN");
    expect(canViewProject(user, own, "projects")).toBe(true);
    expect(canViewProject(user, other, "projects")).toBe(false);
  });

  it("PM Hub Basic user sees only assigned projects for projects/dashboard/stratos", () => {
    const user = makeUser({
      id: "u-pm-basic",
      email: "pmbasic@portal.local",
      azureObjectId: "66666666-6666-6666-6666-666666666666",
      roleType: "PROJECT_MANAGEMENT_HUB_BASIC_USER"
    });

    const assigned = makeProject({
      id: "SP-2026-010",
      assignments: [
        {
          userId: "u-pm-basic",
          userEmail: "pmbasic@portal.local",
          userAzureObjectId: "66666666-6666-6666-6666-666666666666"
        }
      ]
    });
    const unassigned = makeProject({
      id: "SP-2026-011",
      assignments: []
    });

    expect(projectVisibilityScope(user, "projects")).toBe("ASSIGNED");
    expect(projectVisibilityScope(user, "dashboard")).toBe("ASSIGNED");
    expect(projectVisibilityScope(user, "stratos_lab")).toBe("ASSIGNED");

    expect(canViewProject(user, assigned, "projects")).toBe(true);
    expect(canViewProject(user, assigned, "dashboard")).toBe(true);
    expect(canViewProject(user, assigned, "stratos_lab")).toBe(true);

    expect(canViewProject(user, unassigned, "projects")).toBe(false);
    expect(canViewProject(user, unassigned, "dashboard")).toBe(false);
    expect(canViewProject(user, unassigned, "stratos_lab")).toBe(false);
  });

  it("Governance roles see all in Dashboard/STRATOS but only own in Projects", () => {
    const financeUser = makeUser({
      id: "u-fin",
      email: "finance@portal.local",
      roleType: "FINANCE_GOVERNANCE_USER"
    });
    const projectGovUser = makeUser({
      id: "u-pgo",
      email: "pgo@portal.local",
      roleType: "PROJECT_GOVERNANCE_USER"
    });
    const spoUser = makeUser({
      id: "u-spo",
      email: "spo@portal.local",
      roleType: "SPO_COMMITTEE_HUB_USER"
    });

    const otherProject = makeProject({
      id: "SP-2026-020",
      createdByUserId: "u-other",
      ownerEmail: "other@portal.local"
    });

    for (const user of [financeUser, projectGovUser, spoUser]) {
      expect(canViewProject(user, otherProject, "projects")).toBe(false);
      expect(canViewProject(user, otherProject, "dashboard")).toBe(true);
      expect(canViewProject(user, otherProject, "stratos_lab")).toBe(true);
    }
  });

  it("Sponsors can view and approve only their designated projects and cannot edit", () => {
    const sponsor = makeUser({
      id: "u-sponsor",
      email: "sponsor@portal.local",
      azureObjectId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      roleType: "BASIC_USER"
    });

    const designatedProject = makeProject({
      id: "SP-2026-030",
      businessSponsorObjectId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      businessSponsorEmail: "sponsor@portal.local"
    });
    const unrelatedProject = makeProject({
      id: "SP-2026-031",
      businessSponsorObjectId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      businessSponsorEmail: "other-sponsor@portal.local"
    });

    expect(canViewProject(sponsor, designatedProject, "projects")).toBe(true);
    expect(
      canApproveProject(sponsor, designatedProject, { stage: "BUSINESS", status: "PENDING" })
    ).toBe(true);

    expect(canViewProject(sponsor, unrelatedProject, "projects")).toBe(false);
    expect(
      canApproveProject(sponsor, unrelatedProject, { stage: "BUSINESS", status: "PENDING" })
    ).toBe(false);

    expect(canEditProject(sponsor, designatedProject)).toBe(false);
  });

  it("Admin sees everything", () => {
    const admin = makeUser({
      id: "u-admin",
      email: "admin@portal.local",
      roleType: "ADMIN"
    });
    const otherProject = makeProject({
      createdByUserId: "u-other",
      ownerEmail: "other@portal.local"
    });

    expect(canAccessModule(admin, "projects")).toBe(true);
    expect(canAccessModule(admin, "dashboard")).toBe(true);
    expect(canAccessModule(admin, "stratos_lab")).toBe(true);
    expect(canAccessModule(admin, "finance_governance_hub")).toBe(true);
    expect(canAccessModule(admin, "project_governance_hub")).toBe(true);
    expect(canAccessModule(admin, "spo_committee_hub")).toBe(true);
    expect(canAccessModule(admin, "project_management_hub")).toBe(true);
    expect(canAccessModule(admin, "user_admin")).toBe(true);

    expect(canViewProject(admin, otherProject, "projects")).toBe(true);
    expect(canEditProject(admin, otherProject)).toBe(true);
    expect(canApproveProject(admin, otherProject, { stage: "FINANCE", status: "PENDING" })).toBe(true);
  });
});
