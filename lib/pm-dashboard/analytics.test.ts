import { describe, expect, it } from "vitest";

import type { RbacUser } from "@/lib/auth/rbac";
import type { ProjectSubmission } from "@/lib/submissions/types";

import { buildPmProjectsForTests, buildPmSummaryForTests } from "./analytics";

const makeSubmission = (
  overrides: Partial<ProjectSubmission> & Pick<ProjectSubmission, "id" | "title">
): ProjectSubmission => ({
  id: overrides.id,
  title: overrides.title,
  summary: overrides.summary ?? "summary",
  businessUnit: overrides.businessUnit ?? "Corporate",
  opco: overrides.opco ?? "",
  category: overrides.category ?? "Technology",
  requestType: overrides.requestType ?? "Placemat",
  priority: overrides.priority ?? "Medium",
  riskLevel: overrides.riskLevel ?? "Medium",
  regulatoryFlag: overrides.regulatoryFlag ?? "N",
  sponsorName: overrides.sponsorName ?? "Jordan Sponsor",
  sponsorEmail: overrides.sponsorEmail ?? "approver@portal.local",
  ownerName: overrides.ownerName ?? "Sofia Submitter",
  ownerEmail: overrides.ownerEmail ?? "submitter@portal.local",
  status: overrides.status ?? "Draft",
  stage: overrides.stage ?? "Placemat Proposal",
  workflow: overrides.workflow ?? {
    entityType: overrides.stage === "Funding Request" ? "FUNDING_REQUEST" : "PROPOSAL",
    lifecycleStatus: overrides.stage === "Funding Request" ? "FR_DRAFT" : "DRAFT",
    sponsorDecision: "Pending",
    pgoDecision: "Pending",
    financeDecision: "Pending",
    spoDecision: "Pending",
    fundingStatus: "Not Requested"
  },
  dueDate: overrides.dueDate ?? "",
  benefits: overrides.benefits ?? {
    costSaveEst: 20,
    revenueUpliftEst: 30,
    qualitativeBenefits: ""
  },
  dependencies: overrides.dependencies ?? [],
  financialGrid:
    overrides.financialGrid ??
    {
      commencementFiscalYear: 2026,
      investment: {
        hardware: { priorYears: 0, currentFiscal: 0, future: 0 },
        software: { priorYears: 0, currentFiscal: 0, future: 0 },
        consultancyVendor: { priorYears: 0, currentFiscal: 0, future: 0 },
        premisesRealEstate: { priorYears: 0, currentFiscal: 0, future: 0 },
        otherCapital: { priorYears: 0, currentFiscal: 0, future: 0 },
        expenses: { priorYears: 0, currentFiscal: 0, future: 0 }
      },
      incremental: {
        years: [2027, 2028, 2029, 2030, 2031],
        revenue: [10, 10, 10, 10, 10],
        savedCosts: [2, 2, 2, 2, 2],
        addlOperatingCosts: [1, 1, 1, 1, 1]
      }
    },
  financials: overrides.financials ?? {
    capex: 120,
    opex: 45,
    oneTimeCosts: 20,
    runRateSavings: 18,
    paybackMonths: 24,
    paybackYears: 2,
    npv: 3,
    irr: 12
  },
  createdAt: overrides.createdAt ?? "2026-01-05T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-02-15T00:00:00.000Z",
  assignments: overrides.assignments ?? []
});

const fixtures: ProjectSubmission[] = [
  makeSubmission({
    id: "SP-2026-001",
    title: "Assigned Project",
    ownerEmail: "submitter@portal.local",
    stage: "Funding Request",
    status: "Sent for Approval",
    assignments: [
      {
        id: "asmt-1",
        projectId: "SP-2026-001",
        assignmentType: "PM",
        userEmail: "pmbasic@portal.local"
      }
    ]
  }),
  makeSubmission({
    id: "SP-2026-002",
    title: "Unassigned Project",
    ownerEmail: "other@portal.local",
    stage: "PGO & Finance Review",
    status: "Submitted",
    assignments: [
      {
        id: "asmt-2",
        projectId: "SP-2026-002",
        assignmentType: "PM",
        userEmail: "someoneelse@portal.local"
      }
    ]
  })
];

const pmBasicUser: RbacUser = {
  id: "user-pm-basic",
  email: "pmbasic@portal.local",
  roleType: "PROJECT_MANAGEMENT_HUB_BASIC_USER",
  isActive: true
};

const pmAdminUser: RbacUser = {
  id: "user-pm-admin",
  email: "pmadmin@portal.local",
  roleType: "PROJECT_MANAGEMENT_HUB_ADMIN",
  isActive: true
};

describe("pm-dashboard analytics RBAC", () => {
  it("returns only assigned projects for PM Hub Basic user", async () => {
    const response = await buildPmProjectsForTests(fixtures, pmBasicUser);

    expect(response.total).toBe(1);
    expect(response.data[0]?.projectId).toBe("SP-2026-001");
  });

  it("returns all projects for PM Hub Admin user", async () => {
    const response = await buildPmProjectsForTests(fixtures, pmAdminUser);

    expect(response.total).toBe(2);
    expect(response.data.map((row) => row.projectId)).toEqual(
      expect.arrayContaining(["SP-2026-001", "SP-2026-002"])
    );
  });
});

describe("pm-dashboard analytics KPIs", () => {
  it("computes KPI snapshot with non-zero totals", async () => {
    const summary = await buildPmSummaryForTests(fixtures, pmAdminUser);

    expect(summary.kpis.totalActiveProjects).toBeGreaterThan(0);
    expect(summary.kpis.slaCompliancePct).toBeGreaterThanOrEqual(0);
    expect(summary.kpis.slaCompliancePct).toBeLessThanOrEqual(100);
    expect(summary.kpis.avgCycleTimeDays).toBeGreaterThanOrEqual(0);
  });
});
