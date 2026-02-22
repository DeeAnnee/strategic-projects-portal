import { describe, expect, it } from "vitest";
import type { ProjectSubmission } from "@/lib/submissions/types";

import { generateIntakeSummaryLines, generateIntakeSummaryPdf, generateSimplePdf } from "./generate";

const sampleSubmission: ProjectSubmission = {
  id: "SP-2026-123",
  title: "Payments Modernization",
  summary: "Modernize payment flows and simplify manual reconciliation.",
  businessUnit: "Finance",
  opco: "FCIB",
  category: "Technology",
  requestType: "Placemat",
  priority: "High",
  riskLevel: "Medium",
  regulatoryFlag: "N",
  executiveSponsor: "Alex Exec",
  businessSponsor: "Jordan Sponsor",
  segmentUnit: "Finance - Treasury",
  projectTheme: "Innovative",
  strategicObjective: "Simplification",
  specificClassificationType: "PRO - Productivity",
  projectClassification: "PRO",
  projectType: "Grow",
  enterpriseProjectTheme: "SGI - Enable & Simplify Our Bank",
  sponsorName: "Jordan Sponsor",
  sponsorEmail: "approver@portal.local",
  ownerName: "Owner One",
  ownerEmail: "owner@portal.local",
  startDate: "2026-02-01",
  endDate: "2026-12-01",
  targetGoLive: "2026-11-01",
  status: "Sent for Approval",
  stage: "Sponsor Approval",
  workflow: {
    entityType: "PROPOSAL",
    lifecycleStatus: "AT_SPONSOR_REVIEW",
    sponsorDecision: "Pending",
    pgoDecision: "Pending",
    financeDecision: "Pending",
    spoDecision: "Pending",
    fundingStatus: "Not Requested"
  },
  dueDate: "2026-02-15",
  benefits: {
    costSaveEst: 250,
    revenueUpliftEst: 100,
    qualitativeBenefits: "Better controls and faster cycle time",
    financialAssumptions: "Assumes 20% reduction in processing effort.",
    intangibleAssumptions: "Improved client experience and risk reduction."
  },
  dependencies: ["SP-2026-010", "SP-2026-021"],
  financialGrid: {
    commencementFiscalYear: 2026,
    investment: {
      hardware: { priorYears: 30, currentFiscal: 20, future: 10 },
      software: { priorYears: 40, currentFiscal: 25, future: 15 },
      consultancyVendor: { priorYears: 15, currentFiscal: 10, future: 8 },
      premisesRealEstate: { priorYears: 5, currentFiscal: 2, future: 1 },
      otherCapital: { priorYears: 8, currentFiscal: 6, future: 4 },
      expenses: { priorYears: 12, currentFiscal: 9, future: 7 }
    },
    incremental: {
      years: [2027, 2028, 2029, 2030, 2031],
      revenue: [40, 50, 60, 70, 80],
      savedCosts: [12, 14, 16, 18, 20],
      addlOperatingCosts: [3, 3, 4, 4, 5]
    }
  },
  financials: {
    capex: 0,
    opex: 0,
    oneTimeCosts: 0,
    runRateSavings: 0,
    paybackMonths: 0,
    paybackYears: 0,
    npv: 0,
    irr: 0
  },
  createdAt: "2026-02-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z"
};

describe("generateSimplePdf", () => {
  it("adds text leading so line breaks render on separate rows", () => {
    const pdf = generateSimplePdf("Summary Title", ["First line", "Second line"]).toString("utf8");

    expect(pdf).toContain(" TL");
    expect(pdf).toContain("(Summary Title) Tj");
    expect(pdf).toContain("T*");
  });

  it("wraps long lines and creates multiple pages when needed", () => {
    const longWord = "A".repeat(220);
    const manyLines = Array.from({ length: 140 }, (_, index) => `Row ${index + 1}`);
    const pdf = generateSimplePdf("Executive Summary", [longWord, ...manyLines]).toString("utf8");

    const textDrawCommands = (pdf.match(/ Tj/g) ?? []).length;
    expect(textDrawCommands).toBeGreaterThan(manyLines.length + 2);
    expect(pdf).toMatch(/\/Count [2-9][0-9]*/);
  });
});

describe("generateIntakeSummaryLines", () => {
  it("includes all four intake sections for approval summary PDF", () => {
    const text = generateIntakeSummaryLines(sampleSubmission).join("\n");

    expect(text).toContain("A. OVERVIEW");
    expect(text).toContain("B. SPONSOR & TIMELINE");
    expect(text).toContain("C. CHARACTERISTICS");
    expect(text).toContain("D. FINANCIALS");
    expect(text).toContain("Total Investment (US '000s)");
    expect(text).toContain("Incremental Revenue & Cost (US '000s)");
  });
});

describe("generateIntakeSummaryPdf", () => {
  it("renders formatted intake summary with table structure", () => {
    const pdf = generateIntakeSummaryPdf(sampleSubmission).toString("utf8");

    expect(pdf).toContain("Approval Intake Summary");
    expect(pdf).toContain("Total Investment \\(US '000s\\)");
    expect(pdf).toContain("Incremental Revenue & Cost \\(US '000s\\)");
    expect(pdf).toContain(" re S");
  });
});
