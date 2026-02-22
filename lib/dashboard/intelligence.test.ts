import { describe, expect, it } from "vitest";

import type { ProjectSubmission } from "@/lib/submissions/types";

import { applyDashboardFilters, buildDashboardModel, stageProgressPct } from "./intelligence";

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
    costSaveEst: 10,
    revenueUpliftEst: 5,
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
    capex: 100,
    opex: 0,
    oneTimeCosts: 50,
    runRateSavings: 20,
    paybackMonths: 24,
    paybackYears: 2,
    npv: 3,
    irr: 12
  },
  createdAt: overrides.createdAt ?? "2026-01-05T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-02-15T00:00:00.000Z",
  executiveSponsor: overrides.executiveSponsor,
  businessSponsor: overrides.businessSponsor,
  segmentUnit: overrides.segmentUnit,
  projectTheme: overrides.projectTheme,
  strategicObjective: overrides.strategicObjective,
  specificClassificationType: overrides.specificClassificationType,
  projectClassification: overrides.projectClassification,
  projectType: overrides.projectType,
  enterpriseProjectTheme: overrides.enterpriseProjectTheme,
  startDate: overrides.startDate,
  endDate: overrides.endDate,
  targetGoLive: overrides.targetGoLive
});

const fixtures: ProjectSubmission[] = [
  makeSubmission({
    id: "SP-2026-001",
    title: "Payments Modernization",
    stage: "Sponsor Approval",
    status: "Sent for Approval",
    priority: "High",
    riskLevel: "High",
    businessUnit: "Finance",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }),
  makeSubmission({
    id: "SP-2026-002",
    title: "Workplace Refresh",
    stage: "Funding Request",
    status: "Approved",
    category: "Premise",
    businessUnit: "Operations",
    workflow: {
      entityType: "FUNDING_REQUEST",
      lifecycleStatus: "FR_APPROVED",
      sponsorDecision: "Approved",
      pgoDecision: "Approved",
      financeDecision: "Approved",
      spoDecision: "Approved",
      fundingStatus: "Requested"
    }
  }),
  makeSubmission({
    id: "SP-2026-003",
    title: "Automation Program",
    stage: "PGO & Finance Review",
    status: "Submitted",
    category: "Other",
    priority: "Critical",
    riskLevel: "Critical",
    businessUnit: "Technology"
  })
];

describe("applyDashboardFilters", () => {
  it("filters by stage and search text", () => {
    const output = applyDashboardFilters(fixtures, {
      search: "automation",
      businessUnit: "All",
      stage: "PGO & Finance Review",
      category: "All"
    });

    expect(output).toHaveLength(1);
    expect(output[0]?.id).toBe("SP-2026-003");
  });
});

describe("buildDashboardModel", () => {
  it("builds portfolio totals and tactical rates", () => {
    const model = buildDashboardModel(fixtures);

    expect(model.totals.totalProjects).toBe(3);
    expect(model.totals.inReview).toBe(2);
    expect(model.totals.approved).toBe(1);
    expect(model.distributions.byCategory).toHaveLength(3);
    expect(model.watchlist[0]?.id).toBe("SP-2026-003");
    expect(model.tactical.fundingConversionRate).toBeGreaterThan(0);
  });
});

describe("stageProgressPct", () => {
  it("returns progress by stage order", () => {
    expect(stageProgressPct("Placemat Proposal")).toBe(0);
    expect(stageProgressPct("Live Project")).toBeGreaterThan(stageProgressPct("Sponsor Approval"));
  });
});
