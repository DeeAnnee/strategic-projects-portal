"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ReferenceData } from "@/lib/admin/reference-data-config";
import {
  defaultBusinessCaseConfig,
  type BusinessCaseConfig
} from "@/lib/admin/business-case-config-defs";
import type { Role } from "@/lib/auth/roles";
import { DATE_ORDER_ERROR_MESSAGE, isEndBeforeStart } from "@/lib/submissions/date-validation";
import {
  calculateDepreciationOfCapitalByYear,
  calculateFinancialMetrics,
  calculateNetBenefitsByYear
} from "@/lib/submissions/financial-metrics";
import { resolveSponsorEmail } from "@/lib/submissions/sponsor-contact";
import type {
  BusinessCaseCapitalExpenseRow,
  BusinessCaseData,
  BusinessCaseDepreciationSummaryRow,
  BusinessCaseFinancialSummaryRow,
  BusinessCaseHumanResourceRow,
  BusinessCaseMetricRow,
  BusinessCaseOneTimeCostRow,
  BusinessCasePLImpactRow,
  BusinessCaseTechnologyApplicationResourceRow,
  DeepPartial,
  FinancialGrid,
  ProjectSubmission,
  SubmissionAuditEntry,
  WorkflowAction,
  WorkflowState
} from "@/lib/submissions/types";
import {
  getAllowedWorkflowActions,
  isWorkflowEditableStatus,
  resolveWorkflowLifecycleStatus
} from "@/lib/submissions/workflow";

type IntakeTab = "A. Overview" | "B. Sponsor & Timeline" | "C. Characteristics" | "D. Financials";

type FormState = {
  title: string;
  summary: string;
  businessUnit: string;
  opco: string;
  category: string;
  requestType: "Placemat" | "Business Case" | "Special Project";
  priority: "Low" | "Medium" | "High" | "Critical";
  riskLevel: "Low" | "Medium" | "High" | "Critical";
  regulatoryFlag: "Y" | "N";
  projectTheme: string;
  strategicObjective: string;
  specificClassificationType: string;
  projectClassification: string;
  projectType: string;
  enterpriseProjectTheme: string;
  portfolioEsc: string;
  executiveSponsor: string;
  businessSponsor: string;
  segmentUnit: string;
  sponsorName: string;
  sponsorEmail: string;
  ownerName: string;
  ownerEmail: string;
  startDate: string;
  endDate: string;
  targetGoLive: string;
  dueDate: string;
  benefits: {
    costSaveEst: number;
    revenueUpliftEst: number;
    qualitativeBenefits: string;
    financialAssumptions: string;
    intangibleAssumptions: string;
  };
  dependencies: string[];
  financialGrid: FinancialGrid;
  businessCase: BusinessCaseData;
  financials: {
    capex: number;
    opex: number;
    oneTimeCosts: number;
    runRateSavings: number;
    paybackMonths: number;
    paybackYears?: number;
    npv?: number;
    irr?: number;
  };
};

type Props = {
  initialData?: ProjectSubmission;
  forceReadOnly?: boolean;
};

type CurrentUser = {
  name: string;
  email: string;
  roleType: Role;
  role: Role;
};

type PortalUserOption = {
  id: string;
  azureObjectId?: string;
  name: string;
  email: string;
  jobTitle?: string;
  photoUrl?: string;
  roleType: Role;
  role: Role;
};

type ApiErrorPayload = {
  message?: string;
  issues?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  };
};

type CapitalExpenseNumericField =
  | "quantity"
  | "unitCost"
  | "totalCost"
  | "annualDepreciation"
  | "priorFys"
  | "f2025Q1"
  | "f2025Q2"
  | "f2025Q3"
  | "f2025Q4"
  | "f2025Plan"
  | "f2026"
  | "f2027"
  | "f2028"
  | "f2029"
  | "f2030";

type OneTimeCostNumericField =
  | "projectTotal"
  | "priorFys"
  | "currentYearSpend"
  | "currentYearPlan"
  | "yearPlus1"
  | "yearPlus2"
  | "yearPlus3"
  | "yearPlus4"
  | "yearPlus5"
  | "total";

type PLImpactNumericField =
  | "priorFys"
  | "currentYear"
  | "yearPlus1"
  | "yearPlus2"
  | "yearPlus3"
  | "yearPlus4"
  | "yearPlus5";

type DepreciationSummaryNumericField =
  | "usefulLifeYears"
  | "totalProjectCost"
  | "projectCostForPhase"
  | "annualDepreciation"
  | "priorFys"
  | "currentYear"
  | "yearPlus1"
  | "yearPlus2"
  | "yearPlus3"
  | "yearPlus4"
  | "yearPlus5"
  | "total";

type FinancialSummaryValueField = keyof BusinessCaseFinancialSummaryRow;

type HumanResourceCostBreakdown = {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  yearly: number[];
  total: number;
  hasData: boolean;
};

const tabs: IntakeTab[] = ["A. Overview", "B. Sponsor & Timeline", "C. Characteristics", "D. Financials"];

const businessCaseTabLabels: Record<IntakeTab, string> = {
  "A. Overview": "A. Project Overview",
  "B. Sponsor & Timeline": "B. Resource Requirements",
  "C. Characteristics": "C. Financial Plan",
  "D. Financials": "D. Metrics and KPIs"
};

const fieldLocationMap: Record<string, string> = {
  title: "A. Overview > Project Name",
  summary: "A. Overview > Project Description",
  financialAssumptions: "A. Overview > Financial Benefits and Assumptions",
  intangibleAssumptions: "A. Overview > Intangible Benefits and Assumptions",
  executiveSponsor: "B. Sponsor & Timeline > Executive Sponsor",
  businessSponsor: "B. Sponsor & Timeline > Business Sponsor",
  startDate: "B. Sponsor & Timeline > Start Date",
  endDate: "B. Sponsor & Timeline > Closure Date",
  segmentUnit: "B. Sponsor & Timeline > Segment - Unit",
  category: "C. Characteristics > Project Category",
  specificClassificationType: "C. Characteristics > Specific Project Classification Type",
  projectTheme: "C. Characteristics > Project Theme",
  strategicObjective: "C. Characteristics > Strategic Objective",
  enterpriseProjectTheme: "C. Characteristics > CIBC Enterprise Project Theme"
};

const formatApiError = (payload: unknown, fallback: string) => {
  const errorPayload = payload as ApiErrorPayload;
  const fieldErrors = errorPayload?.issues?.fieldErrors;
  if (fieldErrors && typeof fieldErrors === "object") {
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (messages && messages.length > 0) {
        const location = fieldLocationMap[field] ?? field;
        return `Validation error in ${location}: ${messages[0]}`;
      }
    }
  }

  const formError = errorPayload?.issues?.formErrors?.[0];
  if (formError) {
    return `Validation error: ${formError}`;
  }

  if (errorPayload?.message) {
    return errorPayload.message;
  }

  return fallback;
};

const investmentRows = [
  { key: "hardware", label: "Hardware" },
  { key: "software", label: "Software" },
  { key: "consultancyVendor", label: "Consultancy/Vendor" },
  { key: "premisesRealEstate", label: "Premises/Real Estate" },
  { key: "otherCapital", label: "Other Capital" },
  { key: "expenses", label: "Expenses" }
] as const;

const incrementalRows = [
  { key: "revenue", label: "Revenue" },
  { key: "savedCosts", label: "Saved Costs" },
  { key: "addlOperatingCosts", label: "Additional Operating Costs" }
] as const;

const defaultSelectOptions: ReferenceData = {
  executiveSponsors: [],
  businessSponsors: [],
  segments: [
    "PBB - Personal Banking",
    "PBB - Business Banking",
    "PBB - Alternate Channels",
    "PBB - Insurance",
    "PBB - Cards Issuing",
    "CB - Corporate Banking",
    "CB - International Corporate Banking",
    "CB - Investment Banking",
    "CB - Merchant Services",
    "WM - Fund & Trust",
    "WM - Private Wealth",
    "PCB - Human Resources",
    "PCB - Marketing",
    "PCB - Property Services",
    "PCB - Employee Exp. and Client Engage.",
    "PCB - Culture and Change Execution",
    "Finance - Treasury",
    "Finance - Strategy and Economics",
    "Finance - CAD, Reporting, Planning & Tax",
    "Finance - Regulatory Reporting",
    "Risk - Compliance",
    "Risk - Risk Management Services",
    "Risk - Client Credit Management",
    "Risk - Operational Risk",
    "Legal & Corporate Secretary",
    "Transformation, Governance & Control",
    "T&I - Operations",
    "T&I - Enterprise Security & Fraud",
    "T&I - Accounts Payable",
    "T&I - Technology & Infrastructure"
  ],
  projectThemes: ["Innovative", "Business Continuity"],
  strategicObjectives: [
    "Client Relationships",
    "Modern Everyday Client Experience",
    "Simplification",
    "People"
  ],
  classificationTypes: [
    "GRO - Growth",
    "PRO - Productivity",
    "TRAN - Business Transformation",
    "DISC - SBU Discretionary",
    "PS&E - Product & Service Enhancement",
    "MOP - Maintain Operations",
    "EVER - Evergreen",
    "RG 1 - Regulation/Legislation-Enacted",
    "RG 2 - Internal Audit (Escalated Deficiencies)",
    "RG 3 - Regulation/Legislation-Pending"
  ],
  enterpriseThemes: [
    "SGI - Enable & Simplify Our Bank",
    "SBU Discretionary",
    "R&G - Data Governance",
    "R&G - Canadian AML Regulations",
    "R&G - Enterprise Wires Modernization",
    "R&G - RESL Program",
    "R&G - All other R&G",
    "MOPs - Cyber/ InfoSec",
    "MOPs - Technology Currency",
    "MOPs - Real Estate",
    "MOPs - All other MOPs (Maintain Operations)"
  ],
  portfolioEscs: [
    "Cards, Payments & ABM",
    "Digital & Data",
    "Digital Transformation",
    "HR, Finance & Property Services",
    "Technology, Infrastructure & Innovation"
  ],
  projectCategories: ["Technology", "Premise", "Other"],
  fundingSources: ["SPO Projects Fund", "BAU"],
  fundingTypes: ["Seed", "Business Case"],
  projectImportanceLevels: ["Low", "Medium", "High"],
  projectComplexityLevels: ["Low", "Medium", "High"],
  userExperienceImpacts: ["Internal", "External", "Both"],
  resourceTypes: ["Internal", "External"],
  capexOpexTypes: ["CAPEX", "OPEX"],
  availabilityApplicationTiers: ["1 - Critical", "1", "2", "3", "DNR"],
  strategicNonStrategicOptions: ["Strategic", "Non-Strategic"],
  riskAssessmentRequiredOptions: [
    "Yes - CIRA / CIRA Applicability Started",
    "Yes - CIRA / CIRA Applicability Completed",
    "Not Applicable"
  ],
  businessUnits: ["Finance", "Operations", "Technology", "Risk", "HR", "Commercial", "Supply Chain"],
  opcos: ["CIBC Canada", "CIBC US", "CIBC Caribbean", "Corporate"]
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const formatAuditDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};
const parseDateInput = (value: string) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const parseDateInputUtc = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
};

const getResourceLengthMonths = (startDate: string, endDate: string) => {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  if (!start || !end || end < start) return null;
  const msInDay = 1000 * 60 * 60 * 24;
  return round2((end.getTime() - start.getTime()) / msInDay / 30);
};

const getPayGradeMonthlySalaryUsd = (payGrade: string, salaryByPayGrade: Record<string, number>) => {
  if (!payGrade) return null;
  const salary = salaryByPayGrade[payGrade];
  return Number.isFinite(salary) ? salary : null;
};
const getFiscalYearForDate = (date: Date) => {
  const month = date.getMonth();
  const year = date.getFullYear();
  return month >= 10 ? year + 1 : year;
};
const getFiscalYearForUtcDate = (date: Date) => {
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  return month >= 10 ? year + 1 : year;
};
const getDepreciationScheduleByFiscalYear = (
  phaseStartDate: string,
  projectCostForPhase: number,
  usefulLifeYears: number,
  currentFiscalYear: number
): Pick<
  BusinessCaseDepreciationSummaryRow,
  "priorFys" | "currentYear" | "yearPlus1" | "yearPlus2" | "yearPlus3" | "yearPlus4" | "yearPlus5"
> => {
  const schedule = {
    priorFys: 0,
    currentYear: 0,
    yearPlus1: 0,
    yearPlus2: 0,
    yearPlus3: 0,
    yearPlus4: 0,
    yearPlus5: 0
  };

  const normalizedCost = Number.isFinite(projectCostForPhase) ? Math.max(0, projectCostForPhase) : 0;
  const normalizedUsefulLife = Number.isFinite(usefulLifeYears) ? Math.max(0, usefulLifeYears) : 0;
  const startDate = parseDateInputUtc(phaseStartDate);

  if (!startDate || normalizedCost <= 0 || normalizedUsefulLife <= 0) {
    return schedule;
  }

  const endExclusive = new Date(startDate.getTime());
  endExclusive.setUTCFullYear(endExclusive.getUTCFullYear() + normalizedUsefulLife);
  const totalDays = Math.round((endExclusive.getTime() - startDate.getTime()) / MS_PER_DAY);
  if (totalDays <= 0) {
    return schedule;
  }

  const depreciationPerDay = normalizedCost / totalDays;
  const firstFiscalYear = getFiscalYearForUtcDate(startDate);
  const lastFiscalYear = getFiscalYearForUtcDate(new Date(endExclusive.getTime() - 1));

  for (let fiscalYear = firstFiscalYear; fiscalYear <= lastFiscalYear; fiscalYear += 1) {
    const fiscalYearStartMs = Date.UTC(fiscalYear - 1, 10, 1);
    const fiscalYearEndExclusiveMs = Date.UTC(fiscalYear, 10, 1);
    const overlapStartMs = Math.max(startDate.getTime(), fiscalYearStartMs);
    const overlapEndMs = Math.min(endExclusive.getTime(), fiscalYearEndExclusiveMs);
    if (overlapEndMs <= overlapStartMs) {
      continue;
    }

    const overlapDays = (overlapEndMs - overlapStartMs) / MS_PER_DAY;
    const amount = overlapDays * depreciationPerDay;
    const offset = fiscalYear - currentFiscalYear;

    if (offset < 0) {
      schedule.priorFys += amount;
      continue;
    }
    if (offset === 0) {
      schedule.currentYear += amount;
      continue;
    }
    if (offset === 1) {
      schedule.yearPlus1 += amount;
      continue;
    }
    if (offset === 2) {
      schedule.yearPlus2 += amount;
      continue;
    }
    if (offset === 3) {
      schedule.yearPlus3 += amount;
      continue;
    }
    if (offset === 4) {
      schedule.yearPlus4 += amount;
      continue;
    }
    if (offset === 5) {
      schedule.yearPlus5 += amount;
    }
  }

  return {
    priorFys: round2(schedule.priorFys),
    currentYear: round2(schedule.currentYear),
    yearPlus1: round2(schedule.yearPlus1),
    yearPlus2: round2(schedule.yearPlus2),
    yearPlus3: round2(schedule.yearPlus3),
    yearPlus4: round2(schedule.yearPlus4),
    yearPlus5: round2(schedule.yearPlus5)
  };
};
const getFiscalQuarterForDate = (date: Date): 1 | 2 | 3 | 4 => {
  const month = date.getMonth();
  if (month >= 10 || month === 0) {
    return 1;
  }
  if (month >= 1 && month <= 3) {
    return 2;
  }
  if (month >= 4 && month <= 6) {
    return 3;
  }
  return 4;
};
const emptyHumanResourceCostBreakdown = (): HumanResourceCostBreakdown => ({
  q1: 0,
  q2: 0,
  q3: 0,
  q4: 0,
  yearly: Array.from({ length: 6 }, () => 0),
  total: 0,
  hasData: false
});
const calculateHumanResourceCostBreakdown = (
  row: BusinessCaseHumanResourceRow,
  salaryByPayGrade: Record<string, number>,
  currentYear: number
): HumanResourceCostBreakdown => {
  const monthlySalary = getPayGradeMonthlySalaryUsd(row.payGrade, salaryByPayGrade);
  const allocationPct = Number.parseFloat(row.averageAllocationPct);
  const start = parseDateInput(row.resourceStartDate);
  const end = parseDateInput(row.resourceEndDate);

  if (
    monthlySalary === null ||
    !Number.isFinite(allocationPct) ||
    allocationPct <= 0 ||
    !start ||
    !end ||
    end < start
  ) {
    return emptyHumanResourceCostBreakdown();
  }

  const breakdown = emptyHumanResourceCostBreakdown();
  const dailyCost = (monthlySalary * allocationPct) / 100 / 30;
  const cursor = new Date(start.getTime());
  const endAt = end.getTime();

  while (cursor.getTime() <= endAt) {
    const fiscalYear = getFiscalYearForDate(cursor);
    const offset = fiscalYear - currentYear;

    if (offset >= 0 && offset < breakdown.yearly.length) {
      breakdown.yearly[offset] += dailyCost;
      if (offset === 0) {
        const quarter = getFiscalQuarterForDate(cursor);
        if (quarter === 1) breakdown.q1 += dailyCost;
        if (quarter === 2) breakdown.q2 += dailyCost;
        if (quarter === 3) breakdown.q3 += dailyCost;
        if (quarter === 4) breakdown.q4 += dailyCost;
      }
    }

    breakdown.total += dailyCost;
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    q1: round2(breakdown.q1),
    q2: round2(breakdown.q2),
    q3: round2(breakdown.q3),
    q4: round2(breakdown.q4),
    yearly: breakdown.yearly.map((value) => round2(value)),
    total: round2(breakdown.total),
    hasData: true
  };
};

const getCurrentFiscalYear = (date = new Date()) => {
  const month = date.getMonth();
  const calendarYear = date.getFullYear();
  return month >= 10 ? calendarYear + 1 : calendarYear;
};
const getFiscalYearWindow = (startFiscalYear: number, count = 10) =>
  Array.from({ length: count }, (_, index) => startFiscalYear + index);
const parseFiscalYear = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};
const getFiscalYearEndDate = (fiscalYear: number | null) => (fiscalYear ? `${fiscalYear}-10-31` : "");

const yesNoOptions = ["Yes", "No"] as const;
const defaultPayGradeOptions = [
  "FC 1",
  "FC 2",
  "FC 3",
  "FC 4",
  "FC 5",
  "FC 6",
  "FC 7",
  "FC 8",
  "FC 9",
  "FC 10",
  "FC 11+"
] as const;
const ceMatrixOptions = [
  { key: "C", title: "C", ceContribution: "Low", ceNegativeImpact: "High" },
  { key: "D", title: "D", ceContribution: "High", ceNegativeImpact: "High" },
  { key: "A", title: "A", ceContribution: "Low", ceNegativeImpact: "Low" },
  { key: "B", title: "B", ceContribution: "High", ceNegativeImpact: "Low" }
] as const;

type YesNoToggleProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

const YesNoToggle = ({ value, onChange, disabled }: YesNoToggleProps) => (
  <div className="mt-1 inline-flex rounded-full border border-slate-300 bg-slate-100 p-1">
    {yesNoOptions.map((option) => (
      <button
        key={option}
        type="button"
        onClick={() => onChange(option)}
        disabled={disabled}
        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
          value === option ? "bg-brand-700 text-white" : "text-slate-700 hover:bg-slate-200"
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {option}
      </button>
    ))}
  </div>
);

const capitalScheduleFields = ["priorFys", "f2025Q1", "f2025Q2", "f2025Q3", "f2025Q4"] as const;
const capitalTimingFields = ["f2025Plan", "f2026", "f2027", "f2028", "f2029", "f2030"] as const;
const capitalSummableFields = [
  "quantity",
  "totalCost",
  "annualDepreciation",
  ...capitalScheduleFields,
  ...capitalTimingFields
] as const;
const oneTimeCostSummableFields = [
  "projectTotal",
  "priorFys",
  "currentYearSpend",
  "currentYearPlan",
  "yearPlus1",
  "yearPlus2",
  "yearPlus3",
  "yearPlus4",
  "yearPlus5"
] as const;
const pAndLImpactValueFields = [
  "priorFys",
  "currentYear",
  "yearPlus1",
  "yearPlus2",
  "yearPlus3",
  "yearPlus4",
  "yearPlus5"
] as const;
const depreciationSummaryValueFields = [
  "priorFys",
  "currentYear",
  "yearPlus1",
  "yearPlus2",
  "yearPlus3",
  "yearPlus4",
  "yearPlus5"
] as const;
const financialSummaryValueFields = [
  "priorFys",
  "f2025",
  "f2026",
  "f2027",
  "f2028",
  "f2029",
  "f2030"
] as const;

const makeDefaultFinancialGrid = (year = getCurrentFiscalYear()): FinancialGrid => ({
  commencementFiscalYear: year,
  investment: {
    hardware: { priorYears: 0, currentFiscal: 0, future: 0 },
    software: { priorYears: 0, currentFiscal: 0, future: 0 },
    consultancyVendor: { priorYears: 0, currentFiscal: 0, future: 0 },
    premisesRealEstate: { priorYears: 0, currentFiscal: 0, future: 0 },
    otherCapital: { priorYears: 0, currentFiscal: 0, future: 0 },
    expenses: { priorYears: 0, currentFiscal: 0, future: 0 }
  },
  incremental: {
    years: [year + 1, year + 2, year + 3, year + 4, year + 5],
    revenue: [0, 0, 0, 0, 0],
    savedCosts: [0, 0, 0, 0, 0],
    addlOperatingCosts: [0, 0, 0, 0, 0]
  }
});

const defaultBusinessCaseMetric = (): BusinessCaseMetricRow => ({
  keyMetricCategory: "",
  keyMetric: "",
  targetValue: "",
  priorFys: "",
  f2026: "",
  f2027: "",
  f2028: "",
  f2029: "",
  f2030: ""
});

const capitalExpenseRowBlueprints: Array<{
  id: string;
  group: string;
  label: string;
  isTotal?: boolean;
}> = [
  { id: "external-consulting", group: "External Resources", label: "Consulting / Contractors" },
  { id: "external-vendor", group: "External Resources", label: "Vendor" },
  { id: "external-total", group: "External Resources", label: "TOTAL External Resources", isTotal: true },
  { id: "software-os", group: "IT COSTS - Software", label: "Operating Systems Software" },
  { id: "software-app", group: "IT COSTS - Software", label: "Application Systems Software" },
  { id: "software-consultancy", group: "IT COSTS - Software", label: "Consultancy" },
  { id: "software-total", group: "IT COSTS - Software", label: "TOTAL Software Cost", isTotal: true },
  { id: "hardware-desktop", group: "IT COSTS - Hardware", label: "Desktop/Workstation Computers" },
  { id: "hardware-laptop", group: "IT COSTS - Hardware", label: "Laptop Computers" },
  { id: "hardware-monitors", group: "IT COSTS - Hardware", label: "Monitors & Printers" },
  { id: "hardware-servers", group: "IT COSTS - Hardware", label: "Servers" },
  { id: "hardware-host", group: "IT COSTS - Hardware", label: "Host/Mainframe" },
  { id: "hardware-data-comms", group: "IT COSTS - Hardware", label: "Data Communication Equipment" },
  { id: "hardware-voice-comms", group: "IT COSTS - Hardware", label: "Voice Communication Equipment" },
  { id: "hardware-atm", group: "IT COSTS - Hardware", label: "Automated Banking Machines" },
  { id: "hardware-cellular", group: "IT COSTS - Hardware", label: "Cellular Phones" },
  { id: "hardware-pos", group: "IT COSTS - Hardware", label: "POS Terminals" },
  { id: "hardware-total", group: "IT COSTS - Hardware", label: "TOTAL Hardware Cost", isTotal: true },
  { id: "furniture-main", group: "Furniture and Fixtures", label: "Furniture (desks, chairs, workstations, tables)" },
  { id: "furniture-ac", group: "Furniture and Fixtures", label: "Air Conditioners" },
  { id: "furniture-signs-ext", group: "Furniture and Fixtures", label: "Signs: External" },
  { id: "furniture-signs-int", group: "Furniture and Fixtures", label: "Signs: Internal" },
  { id: "furniture-alarms", group: "Furniture and Fixtures", label: "Alarms" },
  { id: "furniture-carpets", group: "Furniture and Fixtures", label: "Carpets" },
  { id: "furniture-drapes", group: "Furniture and Fixtures", label: "Drapes/Blinds" },
  { id: "furniture-access", group: "Furniture and Fixtures", label: "Card Access Control" },
  { id: "furniture-total", group: "Furniture and Fixtures", label: "TOTAL Furniture and Fixtures Costs", isTotal: true },
  { id: "safe-vault-doors", group: "Safekeeping Cost", label: "Vault Doors" },
  { id: "safe-safes", group: "Safekeeping Cost", label: "Safes" },
  { id: "safe-locks", group: "Safekeeping Cost", label: "Safety & Time Locks" },
  { id: "safe-boxes", group: "Safekeeping Cost", label: "Built in Safety Deposit Boxes" },
  { id: "safe-vaults", group: "Safekeeping Cost", label: "Portable insta-vaults, Anti-Holdup Units, Banker's Safe" },
  { id: "safe-bullet", group: "Safekeeping Cost", label: "Bullet Resistive Wickets" },
  { id: "safe-total", group: "Safekeeping Cost", label: "TOTAL Safekeeping Cost", isTotal: true },
  { id: "office-security", group: "Office Equipment Costs", label: "Security Cameras" },
  { id: "office-audio", group: "Office Equipment Costs", label: "Audio Visual" },
  { id: "office-digital", group: "Office Equipment Costs", label: "Portable Digital Cameras" },
  { id: "office-photocopiers", group: "Office Equipment Costs", label: "Photocopiers & Proof Encoders" },
  { id: "office-other", group: "Office Equipment Costs", label: "Other Office & Mechanical Equipment" },
  { id: "office-total", group: "Office Equipment Costs", label: "TOTAL Office Equipment Cost", isTotal: true },
  { id: "other-banking-pavilion", group: "Other Costs", label: "Banking Pavilion" },
  { id: "other-aux-power", group: "Other Costs", label: "Auxiliary Power Equipment" },
  { id: "other-total", group: "Other Costs", label: "TOTAL Other Costs", isTotal: true },
  { id: "premises-leasehold", group: "Premises Costs", label: "Leasehold Premises" },
  { id: "premises-building", group: "Premises Costs", label: "New Building" },
  { id: "premises-total", group: "Premises Costs", label: "TOTAL Premises Costs", isTotal: true },
  { id: "contingency", group: "Adjustments", label: "Contingency" },
  { id: "withholding-tax", group: "Adjustments", label: "Withholding Tax - Barbados Inland Revenue" },
  { id: "capital-total", group: "Adjustments", label: "TOTAL CAPITAL EXPENDITURE", isTotal: true }
];

const defaultCapitalExpenseRow = (
  row: (typeof capitalExpenseRowBlueprints)[number]
): BusinessCaseCapitalExpenseRow => ({
  id: row.id,
  group: row.group,
  label: row.label,
  isTotal: row.isTotal,
  quantity: 0,
  unitCost: 0,
  totalCost: 0,
  comments: "",
  annualDepreciation: 0,
  priorFys: 0,
  f2025Q1: 0,
  f2025Q2: 0,
  f2025Q3: 0,
  f2025Q4: 0,
  f2025Plan: 0,
  f2026: 0,
  f2027: 0,
  f2028: 0,
  f2029: 0,
  f2030: 0
});

const defaultTechnologyApplicationResourceRow = (
  id: string
): BusinessCaseTechnologyApplicationResourceRow => ({
  id,
  impactedApplication: "",
  availabilityApplicationTier: "",
  strategicOrNonStrategic: "",
  rationaleForCompletingWork: "",
  introducesNewApplication: "",
  decommissionOpportunity: ""
});

const defaultHumanResourceRow = (
  id: string
): BusinessCaseHumanResourceRow => ({
  id,
  roleDescription: "",
  responsibilities: "",
  resourceType: "",
  payGrade: "",
  resourceName: "",
  comments: "",
  capexOpex: "",
  resourceStartDate: "",
  resourceEndDate: "",
  hiringRequired: "",
  averageAllocationPct: ""
});

const defaultDepreciationSummaryRow = (
  id: string
): BusinessCaseDepreciationSummaryRow => ({
  id,
  phase: "",
  category: "",
  capexPrepaidCategory: "",
  phaseStartDate: "",
  phaseEndDate: "",
  usefulLifeYears: 0,
  totalProjectCost: 0,
  projectCostForPhase: 0,
  annualDepreciation: 0,
  priorFys: 0,
  currentYear: 0,
  yearPlus1: 0,
  yearPlus2: 0,
  yearPlus3: 0,
  yearPlus4: 0,
  yearPlus5: 0,
  total: 0
});

const defaultOneTimeCostRow = (
  id: string,
  item: string
): BusinessCaseOneTimeCostRow => ({
  id,
  item,
  comments: "",
  projectTotal: 0,
  priorFys: 0,
  currentYearSpend: 0,
  currentYearPlan: 0,
  yearPlus1: 0,
  yearPlus2: 0,
  yearPlus3: 0,
  yearPlus4: 0,
  yearPlus5: 0,
  total: 0
});

const pAndLImpactRowBlueprints: Array<{
  id: string;
  group: string;
  label: string;
  isTotal?: boolean;
}> = [
  { id: "pl-revenue-net-interest", group: "Revenue", label: "Net interest income" },
  { id: "pl-revenue-fees", group: "Revenue", label: "Fees & commissions" },
  { id: "pl-revenue-other", group: "Revenue", label: "Other income" },
  { id: "pl-revenue-attrition", group: "Revenue", label: "Revenue attrition" },
  { id: "pl-revenue-total", group: "Revenue", label: "Total Revenue", isTotal: true },
  { id: "pl-saved-staff", group: "Saved Costs", label: "Staff costs" },
  { id: "pl-saved-it", group: "Saved Costs", label: "IT Costs" },
  { id: "pl-saved-premises", group: "Saved Costs", label: "Premises costs" },
  { id: "pl-saved-depreciation", group: "Saved Costs", label: "Depreciation" },
  { id: "pl-saved-other", group: "Saved Costs", label: "Other costs" },
  { id: "pl-saved-total", group: "Saved Costs", label: "Total Saved Costs", isTotal: true },
  {
    id: "pl-project-expense-spend",
    group: "Project Expense Spend (1x)",
    label: "Project Expense Spend (1x)",
    isTotal: true
  },
  { id: "pl-additional-salaries", group: "Additional Operating Costs", label: "Salaries & Benefits" },
  {
    id: "pl-additional-maintenance",
    group: "Additional Operating Costs",
    label: "Maintenance / Licensing"
  },
  { id: "pl-additional-decommissioning", group: "Additional Operating Costs", label: "Decommissioning" },
  { id: "pl-additional-lease", group: "Additional Operating Costs", label: "Lease Payments" },
  { id: "pl-additional-it", group: "Additional Operating Costs", label: "IT Costs" },
  { id: "pl-additional-other", group: "Additional Operating Costs", label: "<Other specify>" },
  {
    id: "pl-additional-depreciation-amortization",
    group: "Additional Operating Costs",
    label: "Depreciation/Amortization"
  },
  {
    id: "pl-additional-total",
    group: "Additional Operating Costs",
    label: "Total Additional Operating Costs",
    isTotal: true
  },
  { id: "pl-total-expenses", group: "Summary", label: "Total Expenses", isTotal: true },
  { id: "pl-nibt", group: "Summary", label: "NIBT (Net Business Benefit)", isTotal: true }
];

const defaultPLImpactRow = (
  row: (typeof pAndLImpactRowBlueprints)[number]
): BusinessCasePLImpactRow => ({
  id: row.id,
  group: row.group,
  label: row.label,
  isTotal: row.isTotal,
  priorFys: 0,
  currentYear: 0,
  yearPlus1: 0,
  yearPlus2: 0,
  yearPlus3: 0,
  yearPlus4: 0,
  yearPlus5: 0,
  total: 0
});

const makeDefaultBusinessCase = (): BusinessCaseData => ({
  introduction: {
    projectInitiativeName: "",
    fundingSource: "",
    fundingType: "",
    ndaProject: "",
    projectCategory: "",
    projectImportance: "",
    projectComplexity: "",
    businessSponsor: "",
    businessDelegate: "",
    technologySponsor: "",
    financeSponsor: "",
    benefitsSponsor: "",
    inPlanForCurrentYear: "",
    currentYear: "",
    endOfFiscalInCurrentYear: "",
    currentYearSpendVsPlan: "",
    totalCostCapexOneTime: "",
    npv5Year: "",
    irr5Year: "",
    paybackYears: "",
    fteUpDown: "",
    annualOngoingCostExcludingDepreciation: ""
  },
  projectOverview: {
    projectDescription: "",
    opportunityStatement: ""
  },
  scopeSchedule: {
    start: "",
    businessCaseApproval: "",
    goLive: "",
    benefitRealizationStart: "",
    closure: ""
  },
  strategyAlignment: {
    enterpriseStrategyAlignment: "",
    keyDependencies: ""
  },
  resourceRequirements: {
    internalFteRequirements: "",
    externalSupportRequired: "",
    hiringRequired: "",
    additionalResourceDetails: "",
    humanResources: [defaultHumanResourceRow("human-resource-1")],
    technologyApplicationResources: [defaultTechnologyApplicationResourceRow("app-resource-1")]
  },
  userExperience: {
    userExperienceImpact: "",
    userExperienceQuadrant: "",
    impactDescription: ""
  },
  riskMitigation: {
    riskAssessmentRequired: "",
    ciraReferenceName: "",
    ciraReferenceNumber: "",
    highMediumInherentRisk: ""
  },
  investmentRegulationSolution: {
    regulatoryGoverningBody: "",
    specificRegulationNameOrDeficiencyId: "",
    implementationDueDate: "",
    impactedApplication: "",
    availabilityApplicationTier: "",
    strategicOrNonStrategic: "",
    rationaleForCompletingWork: "",
    introducesNewApplication: "",
    decommissionOpportunity: ""
  },
  financialSummary: {
    financialImpactsIncludingWorkforceOperatingCostAndPL: "",
    restructuringHrBauFunded: {
      priorFys: 0,
      f2025: 0,
      f2026: 0,
      f2027: 0,
      f2028: 0,
      f2029: 0,
      f2030: 0
    }
  },
  approvals: {
    requiredStakeholderApprovals: ""
  },
  benefitRealizationPlan: {
    benefitDescription: "",
    assumptions: "",
    dependencies: "",
    deliverable1: "",
    deliverable2: "",
    deliverable3: "",
    nonFinancialBenefitsSummary: "",
    additionalPostProjectDeliverables: "",
    segmentDepartmentTrackingBenefit: "",
    otherEnterpriseBenefits: ""
  },
  capitalExpenses: {
    projectContingencyPct: 0,
    withholdingTaxRatePct: 0,
    withholdingTaxNote: "Withholding Tax - Barbados Inland Revenue: WHTax is generally paid by the vendor",
    rows: capitalExpenseRowBlueprints.map((row) => defaultCapitalExpenseRow(row))
  },
  depreciationSummary: {
    endOfCurrentYearFiscal: "",
    rows: Array.from({ length: 15 }, (_, index) => defaultDepreciationSummaryRow(`depreciation-${index + 1}`)),
    depreciationProratingGoLiveOrImplementationDate: "",
    depreciationProratingPeriodsRemainingInLastYear: "",
    notes: ""
  },
  oneTimeCosts: {
    rows: [
      defaultOneTimeCostRow("ot-training", "Training"),
      defaultOneTimeCostRow("ot-staff-travel", "Staff Travel (excl training)"),
      defaultOneTimeCostRow("ot-staff-meals", "Staff Expenses - Meals/mileage"),
      defaultOneTimeCostRow("ot-staff-overtime", "Staff Expenses - Overtime"),
      defaultOneTimeCostRow("ot-vendor", "Vendor Costs"),
      defaultOneTimeCostRow("ot-consultancy", "Consultancy"),
      defaultOneTimeCostRow("ot-consultants-onsite", "Consultants On-Site Cost"),
      defaultOneTimeCostRow("ot-contractors", "Contractors"),
      defaultOneTimeCostRow("ot-marketing", "Marketing"),
      defaultOneTimeCostRow("ot-seed-funding", "Seed Funding (Requirements & Design)"),
      defaultOneTimeCostRow("ot-relocation", "Relocation Costs"),
      defaultOneTimeCostRow("ot-professional-fees", "Professional Fees"),
      defaultOneTimeCostRow("ot-data-migration", "Data Migration"),
      defaultOneTimeCostRow("ot-miscellaneous", "Miscellaneous Costs"),
      defaultOneTimeCostRow("ot-contingency", "Contingency"),
      defaultOneTimeCostRow("ot-withholding-tax", "Withholding Tax - Barbados Inland Revenue"),
      defaultOneTimeCostRow("ot-total", "TOTAL ONE-TIME COSTS")
    ]
  },
  pAndLImpact: {
    rows: pAndLImpactRowBlueprints.map((row) => defaultPLImpactRow(row))
  },
  metricsAndKpis: Array.from({ length: 4 }, () => defaultBusinessCaseMetric()),
  opportunitySummary: Array.from({ length: 5 }, () => "")
});

const normalizeBusinessCase = (businessCase?: DeepPartial<BusinessCaseData>): BusinessCaseData => {
  const fallback = makeDefaultBusinessCase();
  if (!businessCase) {
    return fallback;
  }

  const metricRows = Array.from(
    { length: Math.max(businessCase.metricsAndKpis?.length ?? 0, 4) },
    (_, index) => ({
      ...defaultBusinessCaseMetric(),
      ...(businessCase.metricsAndKpis?.[index] ?? {})
    })
  );

  const opportunityRows = Array.from(
    { length: Math.max(businessCase.opportunitySummary?.length ?? 0, 5) },
    (_, index) => businessCase.opportunitySummary?.[index] ?? ""
  );
  const legacyInvestmentResourceRow =
    businessCase.investmentRegulationSolution &&
    (
      businessCase.investmentRegulationSolution.impactedApplication ||
      businessCase.investmentRegulationSolution.availabilityApplicationTier ||
      businessCase.investmentRegulationSolution.strategicOrNonStrategic ||
      businessCase.investmentRegulationSolution.rationaleForCompletingWork ||
      businessCase.investmentRegulationSolution.introducesNewApplication ||
      businessCase.investmentRegulationSolution.decommissionOpportunity
    )
      ? {
          id: "app-resource-1",
          impactedApplication: businessCase.investmentRegulationSolution.impactedApplication ?? "",
          availabilityApplicationTier: businessCase.investmentRegulationSolution.availabilityApplicationTier ?? "",
          strategicOrNonStrategic: businessCase.investmentRegulationSolution.strategicOrNonStrategic ?? "",
          rationaleForCompletingWork: businessCase.investmentRegulationSolution.rationaleForCompletingWork ?? "",
          introducesNewApplication: businessCase.investmentRegulationSolution.introducesNewApplication ?? "",
          decommissionOpportunity: businessCase.investmentRegulationSolution.decommissionOpportunity ?? ""
        }
      : null;
  const incomingTechnologyRows = businessCase.resourceRequirements?.technologyApplicationResources;
  const normalizedTechnologyRows =
    Array.isArray(incomingTechnologyRows) && incomingTechnologyRows.length > 0
      ? incomingTechnologyRows.map((row, index) => ({
          ...defaultTechnologyApplicationResourceRow(`app-resource-${index + 1}`),
          ...(row ?? {}),
          id: row?.id ?? `app-resource-${index + 1}`
        }))
      : legacyInvestmentResourceRow
        ? [legacyInvestmentResourceRow]
        : [...fallback.resourceRequirements.technologyApplicationResources];
  const incomingHumanRows = businessCase.resourceRequirements?.humanResources;
  const normalizedHumanRows =
    Array.isArray(incomingHumanRows) && incomingHumanRows.length > 0
      ? incomingHumanRows.map((row, index) => ({
          ...defaultHumanResourceRow(`human-resource-${index + 1}`),
          ...(row ?? {}),
          id: row?.id ?? `human-resource-${index + 1}`
        }))
      : [...fallback.resourceRequirements.humanResources];

  const incomingCapitalRows = businessCase.capitalExpenses?.rows ?? [];
  const capitalRows = capitalExpenseRowBlueprints.map((blueprint, index) => {
    const fallbackRow = defaultCapitalExpenseRow(blueprint);
    const incoming = incomingCapitalRows[index] ?? {};
    return {
      ...fallbackRow,
      ...incoming,
      id: blueprint.id,
      group: blueprint.group,
      label: blueprint.label,
      isTotal: blueprint.isTotal
    };
  });
  const incomingDepreciationRows = businessCase.depreciationSummary?.rows ?? [];
  const normalizedDepreciationRows = Array.from(
    { length: Math.max(incomingDepreciationRows.length, fallback.depreciationSummary.rows.length) },
    (_, index) => {
      const fallbackRow = fallback.depreciationSummary.rows[index] ?? defaultDepreciationSummaryRow(`depreciation-${index + 1}`);
      const incoming = incomingDepreciationRows[index] ?? {};
      return {
        ...fallbackRow,
        ...incoming,
        id: incoming.id ?? fallbackRow.id ?? `depreciation-${index + 1}`
      };
    }
  );
  const incomingOneTimeRows = businessCase.oneTimeCosts?.rows ?? [];
  const normalizedOneTimeRows = Array.from(
    { length: Math.max(incomingOneTimeRows.length, fallback.oneTimeCosts.rows.length) },
    (_, index) => {
      const fallbackRow =
        fallback.oneTimeCosts.rows[index] ??
        defaultOneTimeCostRow(`ot-${index + 1}`, `Item ${index + 1}`);
      const incoming = incomingOneTimeRows[index] ?? {};
      return {
        ...fallbackRow,
        ...incoming,
        id: incoming.id ?? fallbackRow.id ?? `ot-${index + 1}`,
        item: incoming.item ?? fallbackRow.item
      };
    }
  );
  const incomingPLRows = businessCase.pAndLImpact?.rows ?? [];
  const normalizedPLRows = pAndLImpactRowBlueprints.map((blueprint, index) => {
    const fallbackRow = defaultPLImpactRow(blueprint);
    const incoming = incomingPLRows[index] ?? {};
    return {
      ...fallbackRow,
      ...incoming,
      id: blueprint.id,
      group: blueprint.group,
      label: blueprint.label,
      isTotal: blueprint.isTotal
    };
  });

  const rawUserExperience = {
    ...fallback.userExperience,
    ...(businessCase.userExperience ?? {})
  };
  const legacyQuadrant = ["A", "B", "C", "D"].includes(rawUserExperience.userExperienceImpact.trim().toUpperCase())
    ? rawUserExperience.userExperienceImpact.trim().toUpperCase()
    : "";
  const normalizedUserExperienceImpact = ["Internal", "External", "Both"].includes(rawUserExperience.userExperienceImpact)
    ? rawUserExperience.userExperienceImpact
    : "";
  const normalizedUserExperienceQuadrant = ["A", "B", "C", "D"].includes(
    rawUserExperience.userExperienceQuadrant.trim().toUpperCase()
  )
    ? rawUserExperience.userExperienceQuadrant.trim().toUpperCase()
    : legacyQuadrant;

  return {
    introduction: {
      ...fallback.introduction,
      ...(businessCase.introduction ?? {})
    },
    projectOverview: {
      ...fallback.projectOverview,
      ...(businessCase.projectOverview ?? {})
    },
    scopeSchedule: {
      ...fallback.scopeSchedule,
      ...(businessCase.scopeSchedule ?? {})
    },
    strategyAlignment: {
      ...fallback.strategyAlignment,
      ...(businessCase.strategyAlignment ?? {})
    },
    resourceRequirements: {
      ...fallback.resourceRequirements,
      ...(businessCase.resourceRequirements ?? {}),
      humanResources: normalizedHumanRows,
      technologyApplicationResources: normalizedTechnologyRows
    },
    userExperience: {
      ...rawUserExperience,
      userExperienceImpact: normalizedUserExperienceImpact,
      userExperienceQuadrant: normalizedUserExperienceQuadrant
    },
    riskMitigation: {
      ...fallback.riskMitigation,
      ...(businessCase.riskMitigation ?? {})
    },
    investmentRegulationSolution: {
      ...fallback.investmentRegulationSolution,
      ...(businessCase.investmentRegulationSolution ?? {})
    },
    financialSummary: {
      ...fallback.financialSummary,
      ...(businessCase.financialSummary ?? {}),
      restructuringHrBauFunded: {
        ...fallback.financialSummary.restructuringHrBauFunded,
        ...(businessCase.financialSummary?.restructuringHrBauFunded ?? {})
      }
    },
    approvals: {
      ...fallback.approvals,
      ...(businessCase.approvals ?? {})
    },
    benefitRealizationPlan: {
      ...fallback.benefitRealizationPlan,
      ...(businessCase.benefitRealizationPlan ?? {})
    },
    capitalExpenses: {
      projectContingencyPct:
        businessCase.capitalExpenses?.projectContingencyPct ?? fallback.capitalExpenses.projectContingencyPct,
      withholdingTaxRatePct:
        businessCase.capitalExpenses?.withholdingTaxRatePct ?? fallback.capitalExpenses.withholdingTaxRatePct,
      withholdingTaxNote:
        businessCase.capitalExpenses?.withholdingTaxNote ?? fallback.capitalExpenses.withholdingTaxNote,
      rows: capitalRows
    },
    depreciationSummary: {
      endOfCurrentYearFiscal:
        businessCase.depreciationSummary?.endOfCurrentYearFiscal ?? fallback.depreciationSummary.endOfCurrentYearFiscal,
      rows: normalizedDepreciationRows,
      depreciationProratingGoLiveOrImplementationDate:
        businessCase.depreciationSummary?.depreciationProratingGoLiveOrImplementationDate ??
        fallback.depreciationSummary.depreciationProratingGoLiveOrImplementationDate,
      depreciationProratingPeriodsRemainingInLastYear:
        businessCase.depreciationSummary?.depreciationProratingPeriodsRemainingInLastYear ??
        fallback.depreciationSummary.depreciationProratingPeriodsRemainingInLastYear,
      notes: businessCase.depreciationSummary?.notes ?? fallback.depreciationSummary.notes
    },
    oneTimeCosts: {
      rows: normalizedOneTimeRows
    },
    pAndLImpact: {
      rows: normalizedPLRows
    },
    metricsAndKpis: metricRows,
    opportunitySummary: opportunityRows
  };
};

const initialState: FormState = {
  title: "",
  summary: "",
  businessUnit: "Corporate",
  opco: "",
  category: "",
  requestType: "Placemat",
  priority: "Medium",
  riskLevel: "Medium",
  regulatoryFlag: "N",
  projectTheme: "",
  strategicObjective: "",
  specificClassificationType: "",
  projectClassification: "",
  projectType: "",
  enterpriseProjectTheme: "",
  portfolioEsc: "",
  executiveSponsor: "",
  businessSponsor: "",
  segmentUnit: "",
  sponsorName: "",
  sponsorEmail: "",
  ownerName: "Project Owner",
  ownerEmail: "owner@portal.local",
  startDate: "",
  endDate: "",
  targetGoLive: "",
  dueDate: "",
  benefits: {
    costSaveEst: 0,
    revenueUpliftEst: 0,
    qualitativeBenefits: "",
    financialAssumptions: "",
    intangibleAssumptions: ""
  },
  dependencies: [],
  financialGrid: makeDefaultFinancialGrid(),
  businessCase: makeDefaultBusinessCase(),
  financials: {
    capex: 0,
    opex: 0,
    oneTimeCosts: 0,
    runRateSavings: 0,
    paybackMonths: 0,
    paybackYears: 0,
    npv: 0,
    irr: 0
  }
};

const deriveProjectClassification = (value: string) =>
  value.toUpperCase().slice(0, 4);

const deriveProjectType = (projectClassification: string) => {
  const code = projectClassification.toUpperCase();
  const growCodes = new Set(["GRO ", "PRO ", "DISC", "TRAN"]);
  const runCodes = new Set(["PS&E", "RG 1", "RG 2", "RG 3", "MOP ", "EVER"]);

  if (growCodes.has(code)) return "Grow";
  if (runCodes.has(code)) return "Run";
  return "";
};

const mapSubmissionToForm = (data: ProjectSubmission): FormState => ({
  title: data.title,
  summary: data.summary,
  businessUnit: data.businessUnit || "Corporate",
  opco: data.opco ?? "",
  category: data.category,
  requestType: data.requestType,
  priority: data.priority,
  riskLevel: data.riskLevel,
  regulatoryFlag: data.regulatoryFlag,
  projectTheme: data.projectTheme ?? "",
  strategicObjective: data.strategicObjective ?? "",
  specificClassificationType: data.specificClassificationType ?? "",
  projectClassification:
    data.projectClassification ??
    deriveProjectClassification(data.specificClassificationType ?? ""),
  projectType:
    data.projectType ??
    deriveProjectType(
      data.projectClassification ??
        deriveProjectClassification(data.specificClassificationType ?? "")
    ),
  enterpriseProjectTheme: data.enterpriseProjectTheme ?? "",
  portfolioEsc: data.portfolioEsc ?? "",
  executiveSponsor: data.executiveSponsor ?? "",
  businessSponsor: data.businessSponsor ?? data.sponsorName,
  segmentUnit: data.segmentUnit ?? "",
  sponsorName: data.sponsorName,
  sponsorEmail: data.sponsorEmail ?? resolveSponsorEmail(data.businessSponsor ?? data.sponsorName, data.sponsorEmail),
  ownerName: data.ownerName || "Project Owner",
  ownerEmail: data.ownerEmail || "owner@portal.local",
  startDate: data.startDate ? data.startDate.slice(0, 10) : "",
  endDate: data.endDate ? data.endDate.slice(0, 10) : "",
  targetGoLive: data.targetGoLive ? data.targetGoLive.slice(0, 10) : "",
  dueDate: data.dueDate ? data.dueDate.slice(0, 10) : "",
  benefits: {
    costSaveEst: data.benefits.costSaveEst,
    revenueUpliftEst: data.benefits.revenueUpliftEst,
    qualitativeBenefits: data.benefits.qualitativeBenefits,
    financialAssumptions: data.benefits.financialAssumptions ?? "",
    intangibleAssumptions: data.benefits.intangibleAssumptions ?? ""
  },
  dependencies: data.dependencies ?? [],
  financialGrid: data.financialGrid ?? makeDefaultFinancialGrid(),
  businessCase: normalizeBusinessCase(
    data.businessCase ??
      ({
      introduction: {
        projectInitiativeName: data.title ?? "",
        projectCategory: data.category ?? "",
        businessSponsor: data.businessSponsor ?? data.sponsorName ?? "",
        npv5Year: data.financials.npv !== undefined ? String(data.financials.npv) : "",
        irr5Year: data.financials.irr !== undefined ? String(data.financials.irr) : "",
        paybackYears:
          data.financials.paybackYears !== undefined ? String(data.financials.paybackYears) : ""
      },
      projectOverview: {
        projectDescription: data.summary ?? ""
      },
      scopeSchedule: {
        start: data.startDate ? data.startDate.slice(0, 10) : "",
        goLive: data.targetGoLive ? data.targetGoLive.slice(0, 10) : "",
        closure: data.endDate ? data.endDate.slice(0, 10) : ""
      },
      strategyAlignment: {
        keyDependencies: (data.dependencies ?? []).join(", ")
      },
      financialSummary: {
        financialImpactsIncludingWorkforceOperatingCostAndPL: data.benefits.financialAssumptions ?? ""
      },
      benefitRealizationPlan: {
        nonFinancialBenefitsSummary: data.benefits.intangibleAssumptions ?? ""
      }
      } as DeepPartial<BusinessCaseData>)
  ),
  financials: {
    capex: data.financials.capex,
    opex: data.financials.opex,
    oneTimeCosts: data.financials.oneTimeCosts,
    runRateSavings: data.financials.runRateSavings,
    paybackMonths: data.financials.paybackMonths,
    paybackYears: data.financials.paybackYears ?? data.financials.paybackMonths / 12,
    npv: data.financials.npv ?? 0,
    irr: data.financials.irr ?? 0
  }
});

export default function IntakeForm({ initialData, forceReadOnly = false }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialData ? mapSubmissionToForm(initialData) : initialState);
  const [activeTab, setActiveTab] = useState<IntakeTab>("A. Overview");
  const [submissionId, setSubmissionId] = useState<string | null>(initialData?.id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState(initialData?.workflow);
  const [currentStage, setCurrentStage] = useState(initialData?.stage ?? "PROPOSAL");
  const [currentStatus, setCurrentStatus] = useState(initialData?.status ?? "DRAFT");
  const [submissionAuditTrail, setSubmissionAuditTrail] = useState<SubmissionAuditEntry[]>(
    initialData?.auditTrail ?? []
  );
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [portalUsers, setPortalUsers] = useState<PortalUserOption[]>([]);
  const [selectOptions, setSelectOptions] = useState<ReferenceData>(defaultSelectOptions);
  const [businessCaseConfig, setBusinessCaseConfig] = useState<BusinessCaseConfig>(defaultBusinessCaseConfig);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const autosaveTimer = useRef<NodeJS.Timeout | null>(null);
  const previousCommencementFiscalYearRef = useRef<number | null>(null);
  const humanResourcesScrollRef = useRef<HTMLDivElement | null>(null);

  const payGradeMonthlySalaryUsd = useMemo(() => {
    const configuredMap = businessCaseConfig.payGradeMonthlySalaryUsd ?? {};
    if (Object.keys(configuredMap).length > 0) {
      return configuredMap;
    }
    return Object.fromEntries(defaultPayGradeOptions.map((grade) => [grade, 0]));
  }, [businessCaseConfig.payGradeMonthlySalaryUsd]);

  const payGradeOptions = useMemo(() => {
    const configured = Object.keys(payGradeMonthlySalaryUsd)
      .map((grade) => grade.trim())
      .filter(Boolean);
    return configured.length > 0 ? configured : [...defaultPayGradeOptions];
  }, [payGradeMonthlySalaryUsd]);

  const isBusinessCaseMode = currentStage !== "PROPOSAL";
  const tabLabel = useCallback(
    (tab: IntakeTab) => (isBusinessCaseMode ? businessCaseTabLabels[tab] : tab),
    [isBusinessCaseMode]
  );
  const toDisplayTab = useCallback((section: IntakeTab): IntakeTab => section, []);
  const activeSection = activeTab;

  const tabIndex = tabs.indexOf(activeTab);
  const canPrev = tabIndex > 0;
  const canNext = tabIndex < tabs.length - 1;
  const effectiveWorkflowState = useMemo<WorkflowState>(
    () =>
      workflowState ?? {
        entityType: currentStage === "PROPOSAL" ? "PROPOSAL" : "FUNDING_REQUEST",
        lifecycleStatus: currentStage === "PROPOSAL" ? "DRAFT" : "FR_DRAFT",
        sponsorDecision: "Pending",
        pgoDecision: "Pending",
        financeDecision: "Pending",
        spoDecision: "Pending",
        fundingStatus: currentStage === "PROPOSAL" ? "Not Requested" : "Requested"
      },
    [currentStage, workflowState]
  );
  const workflowLifecycleStatus = useMemo(
    () =>
      resolveWorkflowLifecycleStatus({
        stage: currentStage,
        status: currentStatus,
        workflow: effectiveWorkflowState
      }),
    [currentStage, currentStatus, effectiveWorkflowState]
  );
  const isOwner =
    !!currentUser?.email &&
    currentUser.email.toLowerCase() === (form.ownerEmail || "").toLowerCase();
  const hasRoleEditAccess =
    currentUser?.role === "ADMIN" || currentUser?.role === "PROJECT_MANAGEMENT_HUB_ADMIN";
  const ownerLockedByWorkflow = !isWorkflowEditableStatus(workflowLifecycleStatus);
  const isSubmitterLockedAfterSponsorSubmit =
    isOwner &&
    !hasRoleEditAccess &&
    ownerLockedByWorkflow;
  const isReadOnlyByAccess = !currentUser ? false : (!isOwner && !hasRoleEditAccess) || isSubmitterLockedAfterSponsorSubmit;
  const isReadOnlyView = forceReadOnly || isReadOnlyByAccess;

  const totalInvestment = useMemo(() => {
    const grid = form.financialGrid.investment;
    return (
      grid.hardware.priorYears +
      grid.hardware.currentFiscal +
      grid.hardware.future +
      grid.software.priorYears +
      grid.software.currentFiscal +
      grid.software.future +
      grid.consultancyVendor.priorYears +
      grid.consultancyVendor.currentFiscal +
      grid.consultancyVendor.future +
      grid.premisesRealEstate.priorYears +
      grid.premisesRealEstate.currentFiscal +
      grid.premisesRealEstate.future +
      grid.otherCapital.priorYears +
      grid.otherCapital.currentFiscal +
      grid.otherCapital.future +
      grid.expenses.priorYears +
      grid.expenses.currentFiscal +
      grid.expenses.future
    );
  }, [form.financialGrid.investment]);

  const totalIncrementalRevenue = useMemo(
    () => form.financialGrid.incremental.revenue.reduce((sum, value) => sum + value, 0),
    [form.financialGrid.incremental.revenue]
  );

  const totalSavedCosts = useMemo(
    () => form.financialGrid.incremental.savedCosts.reduce((sum, value) => sum + value, 0),
    [form.financialGrid.incremental.savedCosts]
  );

  const totalAddlCosts = useMemo(
    () => form.financialGrid.incremental.addlOperatingCosts.reduce((sum, value) => sum + value, 0),
    [form.financialGrid.incremental.addlOperatingCosts]
  );
  const orderedAuditTrail = useMemo(
    () => [...submissionAuditTrail].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [submissionAuditTrail]
  );

  const capitalTotals = useMemo(() => {
    const investment = form.financialGrid.investment;
    return {
      priorYears:
        investment.hardware.priorYears +
        investment.software.priorYears +
        investment.consultancyVendor.priorYears +
        investment.premisesRealEstate.priorYears +
        investment.otherCapital.priorYears,
      currentFiscal:
        investment.hardware.currentFiscal +
        investment.software.currentFiscal +
        investment.consultancyVendor.currentFiscal +
        investment.premisesRealEstate.currentFiscal +
        investment.otherCapital.currentFiscal,
      future:
        investment.hardware.future +
        investment.software.future +
        investment.consultancyVendor.future +
        investment.premisesRealEstate.future +
        investment.otherCapital.future
    };
  }, [form.financialGrid.investment]);

  const totalInvestmentRow = useMemo(
    () => ({
      priorYears: capitalTotals.priorYears + form.financialGrid.investment.expenses.priorYears,
      currentFiscal: capitalTotals.currentFiscal + form.financialGrid.investment.expenses.currentFiscal,
      future: capitalTotals.future + form.financialGrid.investment.expenses.future
    }),
    [capitalTotals, form.financialGrid.investment.expenses]
  );

  const depreciationOfCapitalByYear = useMemo(
    () => calculateDepreciationOfCapitalByYear(form.financialGrid),
    [form.financialGrid]
  );

  const netBenefitsByYear = useMemo(
    () => calculateNetBenefitsByYear(form.financialGrid),
    [form.financialGrid]
  );

  const financialMetrics = useMemo(
    () =>
      calculateFinancialMetrics(form.financialGrid, {
        capex: form.financials.capex,
        opex: form.financials.opex,
        oneTimeCosts: form.financials.oneTimeCosts,
        runRateSavings: form.financials.runRateSavings,
        paybackMonths: form.financials.paybackMonths,
        paybackYears: form.financials.paybackYears,
        npv: form.financials.npv,
        irr: form.financials.irr
      }),
    [form.financialGrid, form.financials]
  );
  const commencementFiscalYearOptions = useMemo(() => {
    const baseOptions = getFiscalYearWindow(getCurrentFiscalYear(), 10);
    if (!baseOptions.includes(form.financialGrid.commencementFiscalYear)) {
      return [...baseOptions, form.financialGrid.commencementFiscalYear].sort((a, b) => a - b);
    }
    return baseOptions;
  }, [form.financialGrid.commencementFiscalYear]);
  const currentYearOptions = useMemo(() => {
    const options = new Set(commencementFiscalYearOptions);
    const selectedYear = parseFiscalYear(form.businessCase.introduction.currentYear);
    if (selectedYear) {
      options.add(selectedYear);
    }
    return Array.from(options).sort((a, b) => a - b);
  }, [commencementFiscalYearOptions, form.businessCase.introduction.currentYear]);
  const resourceCostCurrentYear = useMemo(
    () => parseFiscalYear(form.businessCase.introduction.currentYear) ?? form.financialGrid.commencementFiscalYear,
    [form.businessCase.introduction.currentYear, form.financialGrid.commencementFiscalYear]
  );
  const resourceCostYears = useMemo(
    () => Array.from({ length: 6 }, (_, offset) => resourceCostCurrentYear + offset),
    [resourceCostCurrentYear]
  );

  const annualOngoingCostExcludingDepreciation = useMemo(() => {
    const values = form.financialGrid.incremental.addlOperatingCosts.map((value) =>
      Number.isFinite(value) ? value : 0
    );
    if (values.length === 0) {
      return 0;
    }
    return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [form.financialGrid.incremental.addlOperatingCosts]);

  const computedNpv5Year = useMemo(() => round2(financialMetrics.npv).toFixed(2), [financialMetrics.npv]);
  const computedIrr5Year = useMemo(
    () => (financialMetrics.irrPct === null ? "N/A" : `${round2(financialMetrics.irrPct).toFixed(2)}%`),
    [financialMetrics.irrPct]
  );
  const computedPaybackYears = useMemo(() => financialMetrics.paybackLabel, [financialMetrics.paybackLabel]);
  const computedAnnualOngoingCost = useMemo(
    () => round2(annualOngoingCostExcludingDepreciation).toFixed(2),
    [annualOngoingCostExcludingDepreciation]
  );
  const shouldShowCiraDetails = useMemo(
    () =>
      form.businessCase.riskMitigation.riskAssessmentRequired ===
      "Yes - CIRA / CIRA Applicability Completed",
    [form.businessCase.riskMitigation.riskAssessmentRequired]
  );
  const shouldShowInvestmentRegulationSection = useMemo(() => {
    const normalized = form.projectClassification.toUpperCase().replace(/\s+/g, "");
    return new Set(["RG", "RG1", "RG2", "RG3"]).has(normalized);
  }, [form.projectClassification]);
  const scrollHumanResourcesTable = useCallback((direction: "left" | "right") => {
    const container = humanResourcesScrollRef.current;
    if (!container) return;
    container.scrollBy({
      left: direction === "right" ? 480 : -480,
      behavior: "smooth"
    });
  }, []);

  const portalUserDirectory = useMemo(() => {
    const byName = new Map<string, PortalUserOption>();
    portalUsers.forEach((user) => {
      const trimmedName = user.name.trim();
      if (trimmedName) {
        byName.set(trimmedName.toLowerCase(), user);
      }
    });
    return byName;
  }, [portalUsers]);

  const resolvePersonEmail = useCallback(
    (nameOrEmail?: string, explicitEmail?: string) => {
      const candidate = (nameOrEmail ?? "").trim();
      if (candidate) {
        const matchedUser = portalUserDirectory.get(candidate.toLowerCase());
        if (matchedUser?.email) {
          return matchedUser.email.toLowerCase();
        }
      }
      return resolveSponsorEmail(candidate, explicitEmail);
    },
    [portalUserDirectory]
  );

  const buildPersonRef = useCallback(
    (nameOrEmail?: string, explicitEmail?: string) => {
      const candidate = (nameOrEmail ?? "").trim();
      if (!candidate) {
        return null;
      }

      const matchedUser = portalUserDirectory.get(candidate.toLowerCase());
      const email = resolvePersonEmail(candidate, explicitEmail);

      return {
        azureObjectId: matchedUser?.azureObjectId || `legacy-${email}`,
        displayName: matchedUser?.name || candidate,
        email,
        jobTitle: matchedUser?.jobTitle || "",
        ...(matchedUser?.photoUrl ? { photoUrl: matchedUser.photoUrl } : {})
      };
    },
    [portalUserDirectory, resolvePersonEmail]
  );

  const personSelectorOptions = useMemo(() => {
    const uniqueNames = new Set<string>();

    portalUsers.forEach((user) => {
      const name = user.name.trim();
      if (name) {
        uniqueNames.add(name);
      }
    });

    [
      form.executiveSponsor,
      form.businessSponsor,
      form.businessCase.introduction.businessDelegate,
      form.businessCase.introduction.technologySponsor,
      form.businessCase.introduction.financeSponsor,
      form.businessCase.introduction.benefitsSponsor
    ].forEach((name) => {
      const trimmed = name.trim();
      if (trimmed) {
        uniqueNames.add(trimmed);
      }
    });

    return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b));
  }, [
    form.businessCase.introduction.benefitsSponsor,
    form.businessCase.introduction.businessDelegate,
    form.businessCase.introduction.financeSponsor,
    form.businessCase.introduction.technologySponsor,
    form.businessSponsor,
    form.executiveSponsor,
    portalUsers
  ]);
  const staffNameOptions = useMemo(() => {
    const uniqueNames = new Set<string>(personSelectorOptions);
    form.businessCase.resourceRequirements.humanResources.forEach((row) => {
      const trimmed = row.resourceName.trim();
      if (trimmed) {
        uniqueNames.add(trimmed);
      }
    });
    return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b));
  }, [form.businessCase.resourceRequirements.humanResources, personSelectorOptions]);

  const resourceRequirementSummary = useMemo(() => {
    const truncate = (value: string, max = 4000) =>
      value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
    const summarizeList = (values: string[], maxItems = 6) => {
      const unique = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
      if (unique.length === 0) return "";
      if (unique.length <= maxItems) return unique.join(", ");
      return `${unique.slice(0, maxItems).join(", ")} +${unique.length - maxItems} more`;
    };

    const populatedHumanRows = form.businessCase.resourceRequirements.humanResources.filter((row) =>
      [
        row.roleDescription,
        row.responsibilities,
        row.resourceType,
        row.payGrade,
        row.resourceName,
        row.comments,
        row.capexOpex,
        row.resourceStartDate,
        row.resourceEndDate,
        row.hiringRequired,
        row.averageAllocationPct
      ].some((value) => value.trim() !== "")
    );

    const internalRows = populatedHumanRows.filter((row) => row.resourceType.trim().toLowerCase() === "internal");
    const externalRows = populatedHumanRows.filter((row) => row.resourceType.trim().toLowerCase() === "external");

    const internalRoleSummary = summarizeList(
      internalRows.map((row) => row.roleDescription.trim() || row.resourceName.trim()).filter(Boolean)
    );
    const externalRoleSummary = summarizeList(
      externalRows.map((row) => row.roleDescription.trim() || row.resourceName.trim()).filter(Boolean)
    );

    const populatedTechRows = form.businessCase.resourceRequirements.technologyApplicationResources.filter((row) =>
      [
        row.impactedApplication,
        row.availabilityApplicationTier,
        row.strategicOrNonStrategic,
        row.rationaleForCompletingWork,
        row.introducesNewApplication,
        row.decommissionOpportunity
      ].some((value) => value.trim() !== "")
    );

    const impactedApplicationSummary = summarizeList(
      populatedTechRows.map((row) => row.impactedApplication.trim()).filter(Boolean)
    );
    const newApplicationCount = populatedTechRows.filter(
      (row) => row.introducesNewApplication.trim().toLowerCase() === "yes"
    ).length;
    const decommissionOpportunityCount = populatedTechRows.filter(
      (row) => row.decommissionOpportunity.trim().toLowerCase() === "yes"
    ).length;
    const hiringRequiredCount = populatedHumanRows.filter(
      (row) => row.hiringRequired.trim().toLowerCase() === "yes"
    ).length;
    const capexCount = populatedHumanRows.filter((row) => row.capexOpex.trim().toUpperCase() === "CAPEX").length;
    const opexCount = populatedHumanRows.filter((row) => row.capexOpex.trim().toUpperCase() === "OPEX").length;

    const internalFteRequirements =
      internalRows.length > 0
        ? `${internalRows.length} internal resource(s) identified${
            internalRoleSummary ? `: ${internalRoleSummary}` : ""
          }.`
        : "No internal requirements identified from Human Resources.";

    const externalSupportParts: string[] = [];
    if (externalRows.length > 0) {
      externalSupportParts.push(
        `${externalRows.length} external resource(s) identified${
          externalRoleSummary ? `: ${externalRoleSummary}` : ""
        }.`
      );
    }
    if (populatedTechRows.length > 0) {
      externalSupportParts.push(
        `Technology application support required for ${populatedTechRows.length} application(s)${
          impactedApplicationSummary ? `: ${impactedApplicationSummary}` : ""
        }.`
      );
    }
    const externalSupportRequired =
      externalSupportParts.length > 0
        ? externalSupportParts.join(" ")
        : "No external support required based on current tables.";

    const hiringRequired =
      populatedHumanRows.length === 0
        ? "No resource rows entered yet."
        : hiringRequiredCount > 0
          ? `Yes (${hiringRequiredCount} role(s) marked as Hiring Required).`
          : "No (no roles marked as Hiring Required).";

    const additionalResourceParts: string[] = [];
    if (populatedHumanRows.length > 0) {
      const capexOpexSummary =
        capexCount > 0 || opexCount > 0 ? ` (CAPEX: ${capexCount}, OPEX: ${opexCount})` : "";
      additionalResourceParts.push(`Human resource rows: ${populatedHumanRows.length}${capexOpexSummary}.`);
    }
    if (populatedTechRows.length > 0) {
      additionalResourceParts.push(
        `Technology application rows: ${populatedTechRows.length} (New Applications: ${newApplicationCount}, Decommission Opportunities: ${decommissionOpportunityCount}).`
      );
    }
    const additionalResourceDetails =
      additionalResourceParts.length > 0
        ? additionalResourceParts.join(" ")
        : "No additional resource details from current tables.";

    return {
      internalFteRequirements: truncate(internalFteRequirements),
      externalSupportRequired: truncate(externalSupportRequired),
      hiringRequired: truncate(hiringRequired),
      additionalResourceDetails: truncate(additionalResourceDetails)
    };
  }, [
    form.businessCase.resourceRequirements.humanResources,
    form.businessCase.resourceRequirements.technologyApplicationResources
  ]);

  const depreciationYearsByLabel = useMemo(() => {
    return new Map(
      businessCaseConfig.depreciationRules.map((rule) => [rule.label.trim(), Math.max(1, rule.usefulLifeYears)])
    );
  }, [businessCaseConfig.depreciationRules]);

  const depreciationCategoryMap = useMemo(() => {
    const rawMap = businessCaseConfig.depreciationCategoryMap ?? {};
    const normalized: Record<string, string[]> = {};

    for (const [rawCategory, rawItems] of Object.entries(rawMap)) {
      const category = rawCategory.trim();
      if (!category) continue;

      const uniqueItems = Array.from(new Set((rawItems ?? []).map((item) => item.trim()).filter(Boolean)));
      normalized[category] = uniqueItems;
    }

    return normalized;
  }, [businessCaseConfig.depreciationCategoryMap]);

  const depreciationCategoryOptions = useMemo(() => {
    const configured = Object.keys(depreciationCategoryMap);
    const configuredSet = new Set(configured);
    const rowDerived = form.businessCase.depreciationSummary.rows
      .map((row) => row.category.trim())
      .filter((value) => Boolean(value) && !configuredSet.has(value));

    return [...configured, ...rowDerived];
  }, [depreciationCategoryMap, form.businessCase.depreciationSummary.rows]);

  const getCapexPrepaidOptionsForCategory = useCallback(
    (category: string, currentValue = "") => {
      const normalizedCategory = category.trim();
      if (!normalizedCategory) return [];
      const configured = depreciationCategoryMap[normalizedCategory] ?? [];
      const normalizedCurrent = currentValue.trim();
      if (!normalizedCurrent || configured.includes(normalizedCurrent)) {
        return configured;
      }
      return [...configured, normalizedCurrent];
    },
    [depreciationCategoryMap]
  );

  const depreciationSummaryRows = useMemo(() => {
    const totalProjectCost = round2(
      form.businessCase.depreciationSummary.rows.reduce((sum, row) => {
        const projectCostForPhase = Number.isFinite(row.projectCostForPhase) ? row.projectCostForPhase : 0;
        return sum + Math.max(0, projectCostForPhase);
      }, 0)
    );

    return form.businessCase.depreciationSummary.rows.map((row) => {
      const usefulLifeYears = depreciationYearsByLabel.get(row.capexPrepaidCategory.trim()) ?? 0;
      const projectCostForPhase = Number.isFinite(row.projectCostForPhase) ? row.projectCostForPhase : 0;
      const annualDepreciation = usefulLifeYears > 0 ? round2(projectCostForPhase / usefulLifeYears) : 0;
      const depreciationByFiscalYear = getDepreciationScheduleByFiscalYear(
        row.phaseStartDate,
        projectCostForPhase,
        usefulLifeYears,
        resourceCostCurrentYear
      );
      const normalized = {
        ...row,
        usefulLifeYears,
        totalProjectCost,
        projectCostForPhase,
        annualDepreciation,
        ...depreciationByFiscalYear
      };

      normalized.total = round2(
        depreciationSummaryValueFields.reduce((sum, field) => sum + normalized[field], 0)
      );

      return normalized;
    });
  }, [depreciationYearsByLabel, form.businessCase.depreciationSummary.rows, resourceCostCurrentYear]);

  const capitalExpenseRows = useMemo(() => {
    const rows = form.businessCase.capitalExpenses.rows.map((row) => {
      const quantity = Number.isFinite(row.quantity) ? row.quantity : 0;
      const unitCost = Number.isFinite(row.unitCost) ? row.unitCost : 0;
      const totalCost = row.isTotal ? row.totalCost : round2(quantity * unitCost);
      const usefulLife = depreciationYearsByLabel.get(row.label.trim());
      const annualDepreciation = row.isTotal ? row.annualDepreciation : usefulLife ? round2(totalCost / usefulLife) : 0;
      return {
        ...row,
        quantity,
        unitCost,
        totalCost,
        annualDepreciation
      };
    });

    const sumField = (
      candidates: BusinessCaseCapitalExpenseRow[],
      field: (typeof capitalSummableFields)[number]
    ) => round2(candidates.reduce((total, item) => total + (Number.isFinite(item[field]) ? item[field] : 0), 0));

    const groups = Array.from(new Set(rows.map((row) => row.group)));
    for (const group of groups) {
      const groupRows = rows.filter((row) => row.group === group);
      const detailRows = groupRows.filter((row) => !row.isTotal);
      const totalRow = groupRows.find((row) => row.isTotal);
      if (!totalRow) continue;

      for (const field of capitalSummableFields) {
        totalRow[field] = sumField(detailRows, field);
      }
      totalRow.unitCost = 0;
    }

    const rowById = new Map(rows.map((row) => [row.id, row]));
    const contingencyRow = rowById.get("contingency");
    const withholdingRow = rowById.get("withholding-tax");
    const capitalTotalRow = rowById.get("capital-total");

    const baseCapital = rows
      .filter((row) => row.isTotal && row.group !== "Adjustments" && row.id !== "capital-total")
      .reduce((total, row) => total + row.totalCost, 0);

    if (contingencyRow) {
      contingencyRow.quantity = 0;
      contingencyRow.unitCost = 0;
      contingencyRow.annualDepreciation = 0;
      contingencyRow.priorFys = 0;
      contingencyRow.f2025Q1 = 0;
      contingencyRow.f2025Q2 = 0;
      contingencyRow.f2025Q3 = 0;
      contingencyRow.f2025Q4 = 0;
      contingencyRow.f2025Plan = round2((baseCapital * form.businessCase.capitalExpenses.projectContingencyPct) / 100);
      contingencyRow.f2026 = 0;
      contingencyRow.f2027 = 0;
      contingencyRow.f2028 = 0;
      contingencyRow.f2029 = 0;
      contingencyRow.f2030 = 0;
      contingencyRow.totalCost = contingencyRow.f2025Plan;
    }

    if (withholdingRow) {
      withholdingRow.quantity = 0;
      withholdingRow.unitCost = 0;
      withholdingRow.annualDepreciation = 0;
      withholdingRow.priorFys = 0;
      withholdingRow.f2025Q1 = 0;
      withholdingRow.f2025Q2 = 0;
      withholdingRow.f2025Q3 = 0;
      withholdingRow.f2025Q4 = 0;
      withholdingRow.f2025Plan = round2((baseCapital * form.businessCase.capitalExpenses.withholdingTaxRatePct) / 100);
      withholdingRow.f2026 = 0;
      withholdingRow.f2027 = 0;
      withholdingRow.f2028 = 0;
      withholdingRow.f2029 = 0;
      withholdingRow.f2030 = 0;
      withholdingRow.totalCost = withholdingRow.f2025Plan;
    }

    if (capitalTotalRow) {
      const sourceRows = rows.filter(
        (row) =>
          row.id !== "capital-total" &&
          (row.isTotal || row.id === "contingency" || row.id === "withholding-tax")
      );
      for (const field of capitalSummableFields) {
        capitalTotalRow[field] = sumField(sourceRows, field);
      }
      capitalTotalRow.unitCost = 0;
    }

    return rows;
  }, [
    form.businessCase.capitalExpenses.projectContingencyPct,
    form.businessCase.capitalExpenses.rows,
    form.businessCase.capitalExpenses.withholdingTaxRatePct,
    depreciationYearsByLabel
  ]);

  const oneTimeCostRows = useMemo(() => {
    const rows = form.businessCase.oneTimeCosts.rows.map((row) => ({
      ...row,
      projectTotal: Number.isFinite(row.projectTotal) ? row.projectTotal : 0,
      priorFys: Number.isFinite(row.priorFys) ? row.priorFys : 0,
      currentYearSpend: Number.isFinite(row.currentYearSpend) ? row.currentYearSpend : 0,
      currentYearPlan: Number.isFinite(row.currentYearPlan) ? row.currentYearPlan : 0,
      yearPlus1: Number.isFinite(row.yearPlus1) ? row.yearPlus1 : 0,
      yearPlus2: Number.isFinite(row.yearPlus2) ? row.yearPlus2 : 0,
      yearPlus3: Number.isFinite(row.yearPlus3) ? row.yearPlus3 : 0,
      yearPlus4: Number.isFinite(row.yearPlus4) ? row.yearPlus4 : 0,
      yearPlus5: Number.isFinite(row.yearPlus5) ? row.yearPlus5 : 0
    }));

    for (const row of rows) {
      row.total = round2(
        row.priorFys +
          row.currentYearSpend +
          row.currentYearPlan +
          row.yearPlus1 +
          row.yearPlus2 +
          row.yearPlus3 +
          row.yearPlus4 +
          row.yearPlus5
      );
    }

    const totalRow = rows.find((row) => row.id === "ot-total");
    if (totalRow) {
      const sourceRows = rows.filter((row) => row.id !== "ot-total");
      for (const field of oneTimeCostSummableFields) {
        totalRow[field] = round2(
          sourceRows.reduce((sum, row) => sum + (Number.isFinite(row[field]) ? row[field] : 0), 0)
        );
      }
      totalRow.total = round2(
        totalRow.priorFys +
          totalRow.currentYearSpend +
          totalRow.currentYearPlan +
          totalRow.yearPlus1 +
          totalRow.yearPlus2 +
          totalRow.yearPlus3 +
          totalRow.yearPlus4 +
          totalRow.yearPlus5
      );
    }

    return rows;
  }, [form.businessCase.oneTimeCosts.rows]);

  const oneTimeCostsTotal = useMemo(() => {
    const explicitTotal = oneTimeCostRows.find((row) => row.id === "ot-total");
    if (explicitTotal) {
      return explicitTotal.total;
    }
    return round2(oneTimeCostRows.reduce((sum, row) => sum + row.total, 0));
  }, [oneTimeCostRows]);
  const pAndLImpactRows = useMemo(() => {
    const rows = form.businessCase.pAndLImpact.rows.map((row) => {
      const normalized = {
        ...row,
        priorFys: Number.isFinite(row.priorFys) ? row.priorFys : 0,
        currentYear: Number.isFinite(row.currentYear) ? row.currentYear : 0,
        yearPlus1: Number.isFinite(row.yearPlus1) ? row.yearPlus1 : 0,
        yearPlus2: Number.isFinite(row.yearPlus2) ? row.yearPlus2 : 0,
        yearPlus3: Number.isFinite(row.yearPlus3) ? row.yearPlus3 : 0,
        yearPlus4: Number.isFinite(row.yearPlus4) ? row.yearPlus4 : 0,
        yearPlus5: Number.isFinite(row.yearPlus5) ? row.yearPlus5 : 0
      };
      normalized.total = round2(
        pAndLImpactValueFields.reduce((sum, field) => sum + normalized[field], 0)
      );
      return normalized;
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
    const oneTimeTotalRow = oneTimeCostRows.find((row) => row.id === "ot-total");
    const projectExpenseRow = byId.get("pl-project-expense-spend");
    if (projectExpenseRow) {
      projectExpenseRow.priorFys = round2(oneTimeTotalRow?.priorFys ?? 0);
      projectExpenseRow.currentYear = round2(
        (oneTimeTotalRow?.currentYearSpend ?? 0) + (oneTimeTotalRow?.currentYearPlan ?? 0)
      );
      projectExpenseRow.yearPlus1 = round2(oneTimeTotalRow?.yearPlus1 ?? 0);
      projectExpenseRow.yearPlus2 = round2(oneTimeTotalRow?.yearPlus2 ?? 0);
      projectExpenseRow.yearPlus3 = round2(oneTimeTotalRow?.yearPlus3 ?? 0);
      projectExpenseRow.yearPlus4 = round2(oneTimeTotalRow?.yearPlus4 ?? 0);
      projectExpenseRow.yearPlus5 = round2(oneTimeTotalRow?.yearPlus5 ?? 0);
      projectExpenseRow.total = round2(
        pAndLImpactValueFields.reduce((sum, field) => sum + projectExpenseRow[field], 0)
      );
    }

    const setSummaryRow = (targetId: string, sourceIds: string[]) => {
      const target = byId.get(targetId);
      if (!target) return;
      for (const field of pAndLImpactValueFields) {
        target[field] = round2(
          sourceIds.reduce((sum, sourceId) => sum + (byId.get(sourceId)?.[field] ?? 0), 0)
        );
      }
      target.total = round2(pAndLImpactValueFields.reduce((sum, field) => sum + target[field], 0));
    };

    setSummaryRow("pl-revenue-total", [
      "pl-revenue-net-interest",
      "pl-revenue-fees",
      "pl-revenue-other",
      "pl-revenue-attrition"
    ]);
    setSummaryRow("pl-saved-total", [
      "pl-saved-staff",
      "pl-saved-it",
      "pl-saved-premises",
      "pl-saved-depreciation",
      "pl-saved-other"
    ]);
    setSummaryRow("pl-additional-total", [
      "pl-additional-salaries",
      "pl-additional-maintenance",
      "pl-additional-decommissioning",
      "pl-additional-lease",
      "pl-additional-it",
      "pl-additional-other",
      "pl-additional-depreciation-amortization"
    ]);

    const revenueTotalRow = byId.get("pl-revenue-total");
    const savedTotalRow = byId.get("pl-saved-total");
    const additionalTotalRow = byId.get("pl-additional-total");
    const totalExpensesRow = byId.get("pl-total-expenses");
    if (totalExpensesRow) {
      for (const field of pAndLImpactValueFields) {
        totalExpensesRow[field] = round2(
          (projectExpenseRow?.[field] ?? 0) + (additionalTotalRow?.[field] ?? 0)
        );
      }
      totalExpensesRow.total = round2(
        pAndLImpactValueFields.reduce((sum, field) => sum + totalExpensesRow[field], 0)
      );
    }

    const nibtRow = byId.get("pl-nibt");
    if (nibtRow) {
      for (const field of pAndLImpactValueFields) {
        nibtRow[field] = round2(
          (revenueTotalRow?.[field] ?? 0) +
            (savedTotalRow?.[field] ?? 0) -
            (totalExpensesRow?.[field] ?? 0)
        );
      }
      nibtRow.total = round2(pAndLImpactValueFields.reduce((sum, field) => sum + nibtRow[field], 0));
    }

    return rows;
  }, [form.businessCase.pAndLImpact.rows, oneTimeCostRows]);
  const capitalExpenditureTotal = useMemo(
    () => capitalExpenseRows.find((row) => row.id === "capital-total")?.totalCost ?? 0,
    [capitalExpenseRows]
  );
  const computedTotalCostCapexOneTime = useMemo(
    () => round2(capitalExpenditureTotal + oneTimeCostsTotal).toFixed(2),
    [capitalExpenditureTotal, oneTimeCostsTotal]
  );

  const getCapitalScheduleTotal = useCallback(
    (row: BusinessCaseCapitalExpenseRow) => round2(capitalScheduleFields.reduce((total, field) => total + row[field], 0)),
    []
  );

  const cashFlowDetails = useMemo(() => {
    const capitalTotalRow = capitalExpenseRows.find((row) => row.id === "capital-total");
    const depreciationAnnual = round2(
      capitalExpenseRows
        .filter((row) => !row.isTotal && row.id !== "contingency" && row.id !== "withholding-tax")
        .reduce((total, row) => total + row.annualDepreciation, 0)
    );

    const netBusinessBenefit = {
      priorFys: 0,
      f2025: 0,
      f2026: netBenefitsByYear[0] ?? 0,
      f2027: netBenefitsByYear[1] ?? 0,
      f2028: netBenefitsByYear[2] ?? 0,
      f2029: netBenefitsByYear[3] ?? 0,
      f2030: netBenefitsByYear[4] ?? 0
    };

    const addBackDepreciation = {
      priorFys: 0,
      f2025: 0,
      f2026: depreciationAnnual,
      f2027: depreciationAnnual,
      f2028: depreciationAnnual,
      f2029: depreciationAnnual,
      f2030: depreciationAnnual
    };

    const capitalPrepaidSpending = {
      priorFys: capitalTotalRow?.priorFys ?? 0,
      f2025: capitalTotalRow?.f2025Plan ?? 0,
      f2026: capitalTotalRow?.f2026 ?? 0,
      f2027: capitalTotalRow?.f2027 ?? 0,
      f2028: capitalTotalRow?.f2028 ?? 0,
      f2029: capitalTotalRow?.f2029 ?? 0,
      f2030: capitalTotalRow?.f2030 ?? 0
    };

    const internalResourceCosts = {
      priorFys: 0,
      f2025: 0,
      f2026: form.financialGrid.incremental.addlOperatingCosts[0] ?? 0,
      f2027: form.financialGrid.incremental.addlOperatingCosts[1] ?? 0,
      f2028: form.financialGrid.incremental.addlOperatingCosts[2] ?? 0,
      f2029: form.financialGrid.incremental.addlOperatingCosts[3] ?? 0,
      f2030: form.financialGrid.incremental.addlOperatingCosts[4] ?? 0
    };

    const restructuringSource = form.businessCase.financialSummary.restructuringHrBauFunded;
    const restructuringHrBauFunded = {
      priorFys: Number.isFinite(restructuringSource.priorFys) ? restructuringSource.priorFys : 0,
      f2025: Number.isFinite(restructuringSource.f2025) ? restructuringSource.f2025 : 0,
      f2026: Number.isFinite(restructuringSource.f2026) ? restructuringSource.f2026 : 0,
      f2027: Number.isFinite(restructuringSource.f2027) ? restructuringSource.f2027 : 0,
      f2028: Number.isFinite(restructuringSource.f2028) ? restructuringSource.f2028 : 0,
      f2029: Number.isFinite(restructuringSource.f2029) ? restructuringSource.f2029 : 0,
      f2030: Number.isFinite(restructuringSource.f2030) ? restructuringSource.f2030 : 0
    };

    const netCashFlows = {
      priorFys: round2(
        netBusinessBenefit.priorFys +
          addBackDepreciation.priorFys -
          capitalPrepaidSpending.priorFys -
          internalResourceCosts.priorFys -
          restructuringHrBauFunded.priorFys
      ),
      f2025: round2(
        netBusinessBenefit.f2025 +
          addBackDepreciation.f2025 -
          capitalPrepaidSpending.f2025 -
          internalResourceCosts.f2025 -
          restructuringHrBauFunded.f2025
      ),
      f2026: round2(
        netBusinessBenefit.f2026 +
          addBackDepreciation.f2026 -
          capitalPrepaidSpending.f2026 -
          internalResourceCosts.f2026 -
          restructuringHrBauFunded.f2026
      ),
      f2027: round2(
        netBusinessBenefit.f2027 +
          addBackDepreciation.f2027 -
          capitalPrepaidSpending.f2027 -
          internalResourceCosts.f2027 -
          restructuringHrBauFunded.f2027
      ),
      f2028: round2(
        netBusinessBenefit.f2028 +
          addBackDepreciation.f2028 -
          capitalPrepaidSpending.f2028 -
          internalResourceCosts.f2028 -
          restructuringHrBauFunded.f2028
      ),
      f2029: round2(
        netBusinessBenefit.f2029 +
          addBackDepreciation.f2029 -
          capitalPrepaidSpending.f2029 -
          internalResourceCosts.f2029 -
          restructuringHrBauFunded.f2029
      ),
      f2030: round2(
        netBusinessBenefit.f2030 +
          addBackDepreciation.f2030 -
          capitalPrepaidSpending.f2030 -
          internalResourceCosts.f2030 -
          restructuringHrBauFunded.f2030
      )
    };

    const sumRow = (row: typeof netBusinessBenefit) =>
      round2(row.priorFys + row.f2025 + row.f2026 + row.f2027 + row.f2028 + row.f2029 + row.f2030);

    return {
      netBusinessBenefit: { ...netBusinessBenefit, total: sumRow(netBusinessBenefit) },
      addBackDepreciation: { ...addBackDepreciation, total: sumRow(addBackDepreciation) },
      capitalPrepaidSpending: { ...capitalPrepaidSpending, total: sumRow(capitalPrepaidSpending) },
      internalResourceCosts: { ...internalResourceCosts, total: sumRow(internalResourceCosts) },
      restructuringHrBauFunded: { ...restructuringHrBauFunded, total: sumRow(restructuringHrBauFunded) },
      netCashFlows: { ...netCashFlows, total: sumRow(netCashFlows) }
    };
  }, [
    capitalExpenseRows,
    form.businessCase.financialSummary.restructuringHrBauFunded,
    form.financialGrid.incremental.addlOperatingCosts,
    netBenefitsByYear
  ]);

  const financialSummaryExpensesRows = useMemo(() => {
    type ExpenseSummaryValues = {
      project: number;
      priorFys: number;
      q1: number;
      q2: number;
      q3: number;
      q4: number;
      spendTotal: number;
      plan: number;
      overUnderPlan: number;
      f2026: number;
      f2027: number;
      f2028: number;
      f2029: number;
      f2030: number;
    };

    const normalize = (values: ExpenseSummaryValues): ExpenseSummaryValues => ({
      project: round2(Number.isFinite(values.project) ? values.project : 0),
      priorFys: round2(Number.isFinite(values.priorFys) ? values.priorFys : 0),
      q1: round2(Number.isFinite(values.q1) ? values.q1 : 0),
      q2: round2(Number.isFinite(values.q2) ? values.q2 : 0),
      q3: round2(Number.isFinite(values.q3) ? values.q3 : 0),
      q4: round2(Number.isFinite(values.q4) ? values.q4 : 0),
      spendTotal: round2(Number.isFinite(values.spendTotal) ? values.spendTotal : 0),
      plan: round2(Number.isFinite(values.plan) ? values.plan : 0),
      overUnderPlan: round2(Number.isFinite(values.overUnderPlan) ? values.overUnderPlan : 0),
      f2026: round2(Number.isFinite(values.f2026) ? values.f2026 : 0),
      f2027: round2(Number.isFinite(values.f2027) ? values.f2027 : 0),
      f2028: round2(Number.isFinite(values.f2028) ? values.f2028 : 0),
      f2029: round2(Number.isFinite(values.f2029) ? values.f2029 : 0),
      f2030: round2(Number.isFinite(values.f2030) ? values.f2030 : 0)
    });

    const sumRows = (rows: ExpenseSummaryValues[]): ExpenseSummaryValues =>
      normalize(
        rows.reduce<ExpenseSummaryValues>(
          (acc, row) => ({
            project: acc.project + row.project,
            priorFys: acc.priorFys + row.priorFys,
            q1: acc.q1 + row.q1,
            q2: acc.q2 + row.q2,
            q3: acc.q3 + row.q3,
            q4: acc.q4 + row.q4,
            spendTotal: acc.spendTotal + row.spendTotal,
            plan: acc.plan + row.plan,
            overUnderPlan: acc.overUnderPlan + row.overUnderPlan,
            f2026: acc.f2026 + row.f2026,
            f2027: acc.f2027 + row.f2027,
            f2028: acc.f2028 + row.f2028,
            f2029: acc.f2029 + row.f2029,
            f2030: acc.f2030 + row.f2030
          }),
          {
            project: 0,
            priorFys: 0,
            q1: 0,
            q2: 0,
            q3: 0,
            q4: 0,
            spendTotal: 0,
            plan: 0,
            overUnderPlan: 0,
            f2026: 0,
            f2027: 0,
            f2028: 0,
            f2029: 0,
            f2030: 0
          }
        )
      );

    const capitalTotalRow = capitalExpenseRows.find((row) => row.id === "capital-total");
    const oneTimeTotalRow = oneTimeCostRows.find((row) => row.id === "ot-total");
    const pAndLAdditionalOperatingTotal = pAndLImpactRows.find((row) => row.id === "pl-additional-total");
    const internalResourceFuture = form.financialGrid.incremental.addlOperatingCosts.map((value) =>
      Number.isFinite(value) ? value : 0
    );

    const capitalValues = normalize({
      project: capitalTotalRow?.totalCost ?? 0,
      priorFys: capitalTotalRow?.priorFys ?? 0,
      q1: capitalTotalRow?.f2025Q1 ?? 0,
      q2: capitalTotalRow?.f2025Q2 ?? 0,
      q3: capitalTotalRow?.f2025Q3 ?? 0,
      q4: capitalTotalRow?.f2025Q4 ?? 0,
      spendTotal: round2(
        (capitalTotalRow?.f2025Q1 ?? 0) +
          (capitalTotalRow?.f2025Q2 ?? 0) +
          (capitalTotalRow?.f2025Q3 ?? 0) +
          (capitalTotalRow?.f2025Q4 ?? 0)
      ),
      plan: capitalTotalRow?.f2025Plan ?? 0,
      overUnderPlan: round2(
        (capitalTotalRow?.f2025Q1 ?? 0) +
          (capitalTotalRow?.f2025Q2 ?? 0) +
          (capitalTotalRow?.f2025Q3 ?? 0) +
          (capitalTotalRow?.f2025Q4 ?? 0) -
          (capitalTotalRow?.f2025Plan ?? 0)
      ),
      f2026: capitalTotalRow?.f2026 ?? 0,
      f2027: capitalTotalRow?.f2027 ?? 0,
      f2028: capitalTotalRow?.f2028 ?? 0,
      f2029: capitalTotalRow?.f2029 ?? 0,
      f2030: capitalTotalRow?.f2030 ?? 0
    });

    const oneTimeValues = normalize({
      project: oneTimeTotalRow?.projectTotal ?? 0,
      priorFys: oneTimeTotalRow?.priorFys ?? 0,
      q1: 0,
      q2: 0,
      q3: 0,
      q4: 0,
      spendTotal: oneTimeTotalRow?.currentYearSpend ?? 0,
      plan: oneTimeTotalRow?.currentYearPlan ?? 0,
      overUnderPlan: round2((oneTimeTotalRow?.currentYearSpend ?? 0) - (oneTimeTotalRow?.currentYearPlan ?? 0)),
      f2026: oneTimeTotalRow?.yearPlus1 ?? 0,
      f2027: oneTimeTotalRow?.yearPlus2 ?? 0,
      f2028: oneTimeTotalRow?.yearPlus3 ?? 0,
      f2029: oneTimeTotalRow?.yearPlus4 ?? 0,
      f2030: oneTimeTotalRow?.yearPlus5 ?? 0
    });

    const operatingValues = normalize({
      project: pAndLAdditionalOperatingTotal?.total ?? 0,
      priorFys: pAndLAdditionalOperatingTotal?.priorFys ?? 0,
      q1: 0,
      q2: 0,
      q3: 0,
      q4: 0,
      spendTotal: pAndLAdditionalOperatingTotal?.currentYear ?? 0,
      plan: pAndLAdditionalOperatingTotal?.currentYear ?? 0,
      overUnderPlan: 0,
      f2026: pAndLAdditionalOperatingTotal?.yearPlus1 ?? 0,
      f2027: pAndLAdditionalOperatingTotal?.yearPlus2 ?? 0,
      f2028: pAndLAdditionalOperatingTotal?.yearPlus3 ?? 0,
      f2029: pAndLAdditionalOperatingTotal?.yearPlus4 ?? 0,
      f2030: pAndLAdditionalOperatingTotal?.yearPlus5 ?? 0
    });

    const internalResourcingValues = normalize({
      project: internalResourceFuture.reduce((sum, value) => sum + value, 0),
      priorFys: 0,
      q1: 0,
      q2: 0,
      q3: 0,
      q4: 0,
      spendTotal: 0,
      plan: 0,
      overUnderPlan: 0,
      f2026: internalResourceFuture[0] ?? 0,
      f2027: internalResourceFuture[1] ?? 0,
      f2028: internalResourceFuture[2] ?? 0,
      f2029: internalResourceFuture[3] ?? 0,
      f2030: internalResourceFuture[4] ?? 0
    });

    const totalOperatingValues = sumRows([operatingValues, internalResourcingValues]);
    const totalValues = sumRows([capitalValues, oneTimeValues, totalOperatingValues]);

    return [
      { id: "total-capital-expenditure", label: "Total Capital Expenditure", values: capitalValues },
      { id: "total-one-time-costs", label: "Total One-Time Costs", values: oneTimeValues },
      {
        id: "total-operating-expenditure",
        label: "Total Operating Expenditure",
        values: totalOperatingValues
      },
      {
        id: "operating-expenses",
        label: "Operating Expenses",
        values: operatingValues,
        indent: true
      },
      {
        id: "internal-resourcing-operating-expenses",
        label: "Internal Resourcing Operating Expenses",
        values: internalResourcingValues,
        indent: true
      },
      { id: "total-expenses", label: "Total", values: totalValues, total: true }
    ];
  }, [
    capitalExpenseRows,
    form.financialGrid.incremental.addlOperatingCosts,
    oneTimeCostRows,
    pAndLImpactRows
  ]);

  const financialSummaryExpenseTotals = useMemo(() => {
    const totalRow = financialSummaryExpensesRows.find((row) => row.id === "total-expenses");
    return {
      currentYearSpend: totalRow?.values.spendTotal ?? 0,
      planSpend: totalRow?.values.plan ?? 0
    };
  }, [financialSummaryExpensesRows]);

  const financialSummaryPLRows = useMemo(() => {
    type PLSummaryValues = {
      total: number;
      priorFys: number;
      f2025: number;
      f2026: number;
      f2027: number;
      f2028: number;
      f2029: number;
      f2030: number;
    };

    const normalize = (values: PLSummaryValues): PLSummaryValues => ({
      total: round2(Number.isFinite(values.total) ? values.total : 0),
      priorFys: round2(Number.isFinite(values.priorFys) ? values.priorFys : 0),
      f2025: round2(Number.isFinite(values.f2025) ? values.f2025 : 0),
      f2026: round2(Number.isFinite(values.f2026) ? values.f2026 : 0),
      f2027: round2(Number.isFinite(values.f2027) ? values.f2027 : 0),
      f2028: round2(Number.isFinite(values.f2028) ? values.f2028 : 0),
      f2029: round2(Number.isFinite(values.f2029) ? values.f2029 : 0),
      f2030: round2(Number.isFinite(values.f2030) ? values.f2030 : 0)
    });

    const toSummary = (row?: BusinessCasePLImpactRow): PLSummaryValues =>
      normalize({
        total: row?.total ?? 0,
        priorFys: row?.priorFys ?? 0,
        f2025: row?.currentYear ?? 0,
        f2026: row?.yearPlus1 ?? 0,
        f2027: row?.yearPlus2 ?? 0,
        f2028: row?.yearPlus3 ?? 0,
        f2029: row?.yearPlus4 ?? 0,
        f2030: row?.yearPlus5 ?? 0
      });

    const sumRows = (rows: PLSummaryValues[]): PLSummaryValues =>
      normalize(
        rows.reduce<PLSummaryValues>(
          (acc, row) => ({
            total: acc.total + row.total,
            priorFys: acc.priorFys + row.priorFys,
            f2025: acc.f2025 + row.f2025,
            f2026: acc.f2026 + row.f2026,
            f2027: acc.f2027 + row.f2027,
            f2028: acc.f2028 + row.f2028,
            f2029: acc.f2029 + row.f2029,
            f2030: acc.f2030 + row.f2030
          }),
          {
            total: 0,
            priorFys: 0,
            f2025: 0,
            f2026: 0,
            f2027: 0,
            f2028: 0,
            f2029: 0,
            f2030: 0
          }
        )
      );

    const rowsById = new Map(pAndLImpactRows.map((row) => [row.id, row]));
    const revenue = toSummary(rowsById.get("pl-revenue-total"));
    const costSavings = toSummary(rowsById.get("pl-saved-total"));
    const totalBenefit = sumRows([revenue, costSavings]);
    const projectExpenseSpend = toSummary(rowsById.get("pl-project-expense-spend"));
    const totalAdditionalOperatingCosts = toSummary(rowsById.get("pl-additional-total"));
    const totalExpenses = toSummary(rowsById.get("pl-total-expenses"));
    const nibt = toSummary(rowsById.get("pl-nibt"));

    return [
      { id: "revenue", label: "Revenue", values: revenue },
      { id: "cost-savings-net", label: "Cost Savings (net)", values: costSavings },
      { id: "total-benefit", label: "Total Benefit", values: totalBenefit },
      { id: "project-expense-spend", label: "Project Expense Spend (1x)", values: projectExpenseSpend },
      {
        id: "total-additional-operating-costs",
        label: "Total Add'l Operating costs",
        values: totalAdditionalOperatingCosts
      },
      { id: "total-expenses", label: "Total Expenses", values: totalExpenses },
      { id: "nibt-net-business-benefit", label: "NIBT (Net Business Benefit)", values: nibt, total: true }
    ];
  }, [pAndLImpactRows]);

  const kpiCategories = useMemo(
    () => Object.keys(businessCaseConfig.kpiMetricMap),
    [businessCaseConfig.kpiMetricMap]
  );

  useEffect(() => {
    setForm((prev) => {
      const resolvedBusinessSponsor =
        prev.businessSponsor || prev.sponsorName || prev.businessCase.introduction.businessSponsor;
      const previousCommencementFiscalYear = previousCommencementFiscalYearRef.current;
      const commencementFiscalYear = prev.financialGrid.commencementFiscalYear;
      const existingCurrentYear = prev.businessCase.introduction.currentYear;
      const shouldSyncCurrentYear =
        !existingCurrentYear ||
        (previousCommencementFiscalYear !== null && existingCurrentYear === String(previousCommencementFiscalYear));
      const nextCurrentYear = shouldSyncCurrentYear ? String(commencementFiscalYear) : existingCurrentYear;
      const nextEndOfFiscalInCurrentYear = getFiscalYearEndDate(
        parseFiscalYear(nextCurrentYear) ?? commencementFiscalYear
      );
      previousCommencementFiscalYearRef.current = commencementFiscalYear;

      const nextIntroduction = {
        ...prev.businessCase.introduction,
        projectInitiativeName: prev.title,
        projectCategory: prev.category || "",
        businessSponsor: resolvedBusinessSponsor,
        currentYear: nextCurrentYear,
        endOfFiscalInCurrentYear: nextEndOfFiscalInCurrentYear,
        totalCostCapexOneTime: computedTotalCostCapexOneTime,
        npv5Year: computedNpv5Year,
        irr5Year: computedIrr5Year,
        paybackYears: computedPaybackYears,
        annualOngoingCostExcludingDepreciation: computedAnnualOngoingCost
      };

      const nextProjectOverview = {
        ...prev.businessCase.projectOverview,
        projectDescription: prev.summary
      };

      const nextScopeSchedule = {
        ...prev.businessCase.scopeSchedule,
        start: prev.startDate,
        closure: prev.endDate
      };

      const unchanged =
        prev.businessCase.introduction.projectInitiativeName === nextIntroduction.projectInitiativeName &&
        prev.businessCase.introduction.projectCategory === nextIntroduction.projectCategory &&
        prev.businessCase.introduction.businessSponsor === nextIntroduction.businessSponsor &&
        prev.businessCase.introduction.currentYear === nextIntroduction.currentYear &&
        prev.businessCase.introduction.endOfFiscalInCurrentYear === nextIntroduction.endOfFiscalInCurrentYear &&
        prev.businessCase.introduction.totalCostCapexOneTime === nextIntroduction.totalCostCapexOneTime &&
        prev.businessCase.introduction.npv5Year === nextIntroduction.npv5Year &&
        prev.businessCase.introduction.irr5Year === nextIntroduction.irr5Year &&
        prev.businessCase.introduction.paybackYears === nextIntroduction.paybackYears &&
        prev.businessCase.introduction.annualOngoingCostExcludingDepreciation ===
          nextIntroduction.annualOngoingCostExcludingDepreciation &&
        prev.businessCase.projectOverview.projectDescription === nextProjectOverview.projectDescription &&
        prev.businessCase.scopeSchedule.start === nextScopeSchedule.start &&
        prev.businessCase.scopeSchedule.closure === nextScopeSchedule.closure;

      if (unchanged) {
        return prev;
      }

      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          introduction: nextIntroduction,
          projectOverview: nextProjectOverview,
          scopeSchedule: nextScopeSchedule
        }
      };
    });
  }, [
    computedAnnualOngoingCost,
    computedIrr5Year,
    computedNpv5Year,
    computedPaybackYears,
    computedTotalCostCapexOneTime,
    form.businessSponsor,
    form.category,
    form.endDate,
    form.financialGrid.commencementFiscalYear,
    form.startDate,
    form.summary,
    form.sponsorName,
    form.title
  ]);

  const buildSubmissionPayload = useCallback(() => {
    const projectClassification = deriveProjectClassification(form.specificClassificationType);
    const projectType = deriveProjectType(projectClassification);
    const paybackYears = financialMetrics.paybackYears ?? 0;
    const paybackMonths = financialMetrics.paybackYears === null ? 0 : Math.round(paybackYears * 12);
    const endOfFiscalInCurrentYear =
      form.businessCase.introduction.endOfFiscalInCurrentYear ||
      getFiscalYearEndDate(
        parseFiscalYear(form.businessCase.introduction.currentYear) ?? form.financialGrid.commencementFiscalYear
      );
    const { category, ...restForm } = form;
    const businessSponsorName = form.businessSponsor || form.sponsorName || "Business Sponsor";
    const businessSponsorRef = buildPersonRef(businessSponsorName, form.sponsorEmail);
    const sponsorContacts = {
      businessSponsor: businessSponsorRef,
      businessDelegate: buildPersonRef(form.businessCase.introduction.businessDelegate),
      technologySponsor: buildPersonRef(form.businessCase.introduction.technologySponsor),
      financeSponsor: buildPersonRef(form.businessCase.introduction.financeSponsor),
      benefitsSponsor: buildPersonRef(form.businessCase.introduction.benefitsSponsor)
    };

    return {
      ...restForm,
      ...(category ? { category } : {}),
      projectClassification,
      projectType,
      sponsorName: businessSponsorName,
      sponsorEmail: businessSponsorRef?.email ?? resolvePersonEmail(businessSponsorName, form.sponsorEmail),
      sponsorContacts,
      businessDelegate: form.businessCase.introduction.businessDelegate || "",
      technologySponsor: form.businessCase.introduction.technologySponsor || "",
      financeSponsor: form.businessCase.introduction.financeSponsor || "",
      benefitsSponsor: form.businessCase.introduction.benefitsSponsor || "",
      ownerName: form.ownerName || currentUser?.name || form.businessSponsor || "Project Owner",
      ownerEmail: form.ownerEmail || currentUser?.email || "owner@portal.local",
      businessUnit: form.businessUnit || "Corporate",
      financials: {
        ...form.financials,
        oneTimeCosts: oneTimeCostsTotal,
        paybackMonths,
        paybackYears,
        npv: financialMetrics.npv,
        irr: financialMetrics.irrPct ?? 0
      },
      businessCase: {
        ...form.businessCase,
        introduction: {
          ...form.businessCase.introduction,
          projectInitiativeName: form.title,
          projectCategory: form.category || "",
          businessSponsor: form.businessSponsor || form.sponsorName || form.businessCase.introduction.businessSponsor,
          currentYear:
            form.businessCase.introduction.currentYear || String(form.financialGrid.commencementFiscalYear),
          endOfFiscalInCurrentYear,
          npv5Year: computedNpv5Year,
          irr5Year: computedIrr5Year,
          paybackYears: computedPaybackYears,
          annualOngoingCostExcludingDepreciation: computedAnnualOngoingCost
        },
        projectOverview: {
          ...form.businessCase.projectOverview,
          projectDescription: form.summary
        },
        scopeSchedule: {
          ...form.businessCase.scopeSchedule,
          start: form.startDate,
          closure: form.endDate
        },
        resourceRequirements: {
          ...form.businessCase.resourceRequirements,
          internalFteRequirements: resourceRequirementSummary.internalFteRequirements,
          externalSupportRequired: resourceRequirementSummary.externalSupportRequired,
          hiringRequired: resourceRequirementSummary.hiringRequired,
          additionalResourceDetails: resourceRequirementSummary.additionalResourceDetails
        },
        capitalExpenses: {
          ...form.businessCase.capitalExpenses,
          rows: capitalExpenseRows
        },
        depreciationSummary: {
          ...form.businessCase.depreciationSummary,
          endOfCurrentYearFiscal: endOfFiscalInCurrentYear,
          rows: depreciationSummaryRows
        },
        oneTimeCosts: {
          ...form.businessCase.oneTimeCosts,
          rows: oneTimeCostRows
        },
        pAndLImpact: {
          ...form.businessCase.pAndLImpact,
          rows: pAndLImpactRows
        }
      }
    };
  }, [
    capitalExpenseRows,
    currentUser?.email,
    currentUser?.name,
    depreciationSummaryRows,
    financialMetrics.irrPct,
    financialMetrics.npv,
    financialMetrics.paybackYears,
    computedAnnualOngoingCost,
    computedIrr5Year,
    computedNpv5Year,
    computedPaybackYears,
    buildPersonRef,
    form,
    pAndLImpactRows,
    oneTimeCostRows,
    oneTimeCostsTotal,
    resolvePersonEmail,
    resourceRequirementSummary
  ]);

  const validateDateOrder = useCallback(
    (startDate = form.startDate, endDate = form.endDate) => {
      if (isEndBeforeStart(startDate, endDate)) {
        setDateError(DATE_ORDER_ERROR_MESSAGE);
        return false;
      }

      setDateError(null);
      return true;
    },
    [form.endDate, form.startDate]
  );
  const getHumanResourceDateError = useCallback(() => {
    const invalidIndex = form.businessCase.resourceRequirements.humanResources.findIndex((row) => {
      if (!row.resourceStartDate || !row.resourceEndDate) return false;
      return isEndBeforeStart(row.resourceStartDate, row.resourceEndDate);
    });

    if (invalidIndex === -1) {
      return null;
    }

    return `Validation error in ${tabLabel("B. Sponsor & Timeline")} > Human Resources row ${invalidIndex + 1}: Resource Start Date cannot be after Resource End Date.`;
  }, [form.businessCase.resourceRequirements.humanResources, tabLabel]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateBenefits = (key: keyof FormState["benefits"], value: string | number) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => ({ ...prev, benefits: { ...prev.benefits, [key]: value } }));
  };

  const updateBusinessCaseField = <
    Section extends keyof Omit<FormState["businessCase"], "metricsAndKpis" | "opportunitySummary">,
    Key extends keyof FormState["businessCase"][Section]
  >(
    section: Section,
    key: Key,
    value: string
  ) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => ({
      ...prev,
      businessCase: {
        ...prev.businessCase,
        [section]: {
          ...prev.businessCase[section],
          [key]: value
        }
      }
    }));
  };

  const updateBusinessCaseMetric = (index: number, key: keyof BusinessCaseMetricRow, value: string) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const rows = [...prev.businessCase.metricsAndKpis];
      rows[index] = {
        ...defaultBusinessCaseMetric(),
        ...(rows[index] ?? {}),
        [key]: value
      };
      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          metricsAndKpis: rows
        }
      };
    });
  };
  const updateHumanResourceRow = (
    index: number,
    key: keyof Omit<BusinessCaseHumanResourceRow, "id">,
    value: string
  ) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const rows = [...prev.businessCase.resourceRequirements.humanResources];
      const row = rows[index] ?? defaultHumanResourceRow(`human-resource-${index + 1}`);
      rows[index] = { ...row, [key]: value };
      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          resourceRequirements: {
            ...prev.businessCase.resourceRequirements,
            humanResources: rows
          }
        }
      };
    });
  };
  const addHumanResourceRow = () => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const nextIndex = prev.businessCase.resourceRequirements.humanResources.length + 1;
      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          resourceRequirements: {
            ...prev.businessCase.resourceRequirements,
            humanResources: [
              ...prev.businessCase.resourceRequirements.humanResources,
              defaultHumanResourceRow(`human-resource-${nextIndex}`)
            ]
          }
        }
      };
    });
  };
  const removeHumanResourceRow = (index: number) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const currentRows = prev.businessCase.resourceRequirements.humanResources;
      if (currentRows.length <= 1) {
        return prev;
      }
      const rows = currentRows
        .filter((_, rowIndex) => rowIndex !== index)
        .map((row, rowIndex) => ({
          ...row,
          id: row.id || `human-resource-${rowIndex + 1}`
        }));

      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          resourceRequirements: {
            ...prev.businessCase.resourceRequirements,
            humanResources: rows
          }
        }
      };
    });
  };

  const updateTechnologyApplicationResourceRow = (
    index: number,
    key: keyof Omit<BusinessCaseTechnologyApplicationResourceRow, "id">,
    value: string
  ) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const rows = [...prev.businessCase.resourceRequirements.technologyApplicationResources];
      const row = rows[index] ?? defaultTechnologyApplicationResourceRow(`app-resource-${index + 1}`);
      rows[index] = { ...row, [key]: value };
      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          resourceRequirements: {
            ...prev.businessCase.resourceRequirements,
            technologyApplicationResources: rows
          }
        }
      };
    });
  };

  const addTechnologyApplicationResourceRow = () => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const nextIndex = prev.businessCase.resourceRequirements.technologyApplicationResources.length + 1;
      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          resourceRequirements: {
            ...prev.businessCase.resourceRequirements,
            technologyApplicationResources: [
              ...prev.businessCase.resourceRequirements.technologyApplicationResources,
              defaultTechnologyApplicationResourceRow(`app-resource-${nextIndex}`)
            ]
          }
        }
      };
    });
  };

  const removeTechnologyApplicationResourceRow = (index: number) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const currentRows = prev.businessCase.resourceRequirements.technologyApplicationResources;
      if (currentRows.length <= 1) {
        return prev;
      }

      const rows = currentRows
        .filter((_, rowIndex) => rowIndex !== index)
        .map((row, rowIndex) => ({ ...row, id: row.id || `app-resource-${rowIndex + 1}` }));

      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          resourceRequirements: {
            ...prev.businessCase.resourceRequirements,
            technologyApplicationResources: rows
          }
        }
      };
    });
  };

  const updateBusinessCaseOpportunity = (index: number, value: string) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const rows = [...prev.businessCase.opportunitySummary];
      rows[index] = value;
      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          opportunitySummary: rows
        }
      };
    });
  };

  const updateCapitalExpenseSetting = (
    key: keyof FormState["businessCase"]["capitalExpenses"],
    value: number | string
  ) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => ({
      ...prev,
      businessCase: {
        ...prev.businessCase,
        capitalExpenses: {
          ...prev.businessCase.capitalExpenses,
          [key]: value
        }
      }
    }));
  };

  const updateCapitalExpenseRowNumber = (
    index: number,
    key: CapitalExpenseNumericField,
    value: number
  ) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const rows = [...prev.businessCase.capitalExpenses.rows];
      const row = rows[index];
      if (!row) return prev;
      const next = { ...row, [key]: Number.isFinite(value) ? value : 0 };

      if (!row.isTotal && (key === "quantity" || key === "unitCost")) {
        next.totalCost = Number((next.quantity * next.unitCost).toFixed(2));
      }

      rows[index] = next;

      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          capitalExpenses: {
            ...prev.businessCase.capitalExpenses,
            rows
          }
        }
      };
    });
  };

  const updateCapitalExpenseRowComment = (index: number, value: string) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const rows = [...prev.businessCase.capitalExpenses.rows];
      const row = rows[index];
      if (!row) return prev;
      rows[index] = { ...row, comments: value };
      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          capitalExpenses: {
            ...prev.businessCase.capitalExpenses,
            rows
          }
        }
      };
    });
  };

  const updateDepreciationSummarySetting = (
    key: keyof Omit<FormState["businessCase"]["depreciationSummary"], "rows">,
    value: string
  ) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => ({
      ...prev,
      businessCase: {
        ...prev.businessCase,
        depreciationSummary: {
          ...prev.businessCase.depreciationSummary,
          [key]: value
        }
      }
    }));
  };

  const updateDepreciationSummaryRowText = (
    index: number,
    key: keyof Omit<
      BusinessCaseDepreciationSummaryRow,
      "id" | DepreciationSummaryNumericField
    >,
    value: string
  ) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const rows = [...prev.businessCase.depreciationSummary.rows];
      const row = rows[index] ?? defaultDepreciationSummaryRow(`depreciation-${index + 1}`);
      if (key === "category") {
        const nextCategory = value.trim();
        const availableCapexOptions = (businessCaseConfig.depreciationCategoryMap[nextCategory] ?? []).map((item) =>
          item.trim()
        );
        const normalizedCurrentCapex = row.capexPrepaidCategory.trim();
        const nextCapexPrepaidCategory =
          nextCategory === ""
            ? ""
            : availableCapexOptions.length > 0 && normalizedCurrentCapex && !availableCapexOptions.includes(normalizedCurrentCapex)
              ? ""
              : row.capexPrepaidCategory;
        rows[index] = {
          ...row,
          category: value,
          capexPrepaidCategory: nextCapexPrepaidCategory
        };
      } else {
        rows[index] = { ...row, [key]: value };
      }
      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          depreciationSummary: {
            ...prev.businessCase.depreciationSummary,
            rows
          }
        }
      };
    });
  };

  const updateDepreciationSummaryRowNumber = (
    index: number,
    key: Exclude<DepreciationSummaryNumericField, "annualDepreciation" | "total">,
    value: number
  ) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const rows = [...prev.businessCase.depreciationSummary.rows];
      const row = rows[index] ?? defaultDepreciationSummaryRow(`depreciation-${index + 1}`);
      rows[index] = {
        ...row,
        [key]: Number.isFinite(value) ? value : 0
      };
      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          depreciationSummary: {
            ...prev.businessCase.depreciationSummary,
            rows
          }
        }
      };
    });
  };

  const updateFinancialSummaryRestructuringValue = (
    key: FinancialSummaryValueField,
    value: number
  ) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => ({
      ...prev,
      businessCase: {
        ...prev.businessCase,
        financialSummary: {
          ...prev.businessCase.financialSummary,
          restructuringHrBauFunded: {
            ...prev.businessCase.financialSummary.restructuringHrBauFunded,
            [key]: Number.isFinite(value) ? value : 0
          }
        }
      }
    }));
  };

  const updateOneTimeCostRowText = (
    index: number,
    key: keyof Omit<BusinessCaseOneTimeCostRow, "id" | OneTimeCostNumericField>,
    value: string
  ) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const rows = [...prev.businessCase.oneTimeCosts.rows];
      const row = rows[index] ?? defaultOneTimeCostRow(`ot-${index + 1}`, `Item ${index + 1}`);
      rows[index] = { ...row, [key]: value };
      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          oneTimeCosts: {
            ...prev.businessCase.oneTimeCosts,
            rows
          }
        }
      };
    });
  };

  const updateOneTimeCostRowNumber = (
    index: number,
    key: Exclude<OneTimeCostNumericField, "total">,
    value: number
  ) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const rows = [...prev.businessCase.oneTimeCosts.rows];
      const row = rows[index] ?? defaultOneTimeCostRow(`ot-${index + 1}`, `Item ${index + 1}`);
      if (row.id === "ot-total") {
        return prev;
      }

      const next = { ...row, [key]: Number.isFinite(value) ? value : 0 };
      next.total = round2(
        next.priorFys +
          next.currentYearSpend +
          next.currentYearPlan +
          next.yearPlus1 +
          next.yearPlus2 +
          next.yearPlus3 +
          next.yearPlus4 +
          next.yearPlus5
      );
      rows[index] = next;

      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          oneTimeCosts: {
            ...prev.businessCase.oneTimeCosts,
            rows
          }
        }
      };
    });
  };
  const updatePLImpactRowNumber = (
    index: number,
    key: PLImpactNumericField,
    value: number
  ) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => {
      const rows = [...prev.businessCase.pAndLImpact.rows];
      const row = rows[index] ?? defaultPLImpactRow(pAndLImpactRowBlueprints[index] ?? pAndLImpactRowBlueprints[0]);
      if (row.isTotal || row.id === "pl-project-expense-spend") {
        return prev;
      }

      rows[index] = {
        ...row,
        [key]: Number.isFinite(value) ? value : 0
      };

      return {
        ...prev,
        businessCase: {
          ...prev.businessCase,
          pAndLImpact: {
            ...prev.businessCase.pAndLImpact,
            rows
          }
        }
      };
    });
  };

  const updateInvestmentCell = (
    row: keyof FormState["financialGrid"]["investment"],
    column: keyof FormState["financialGrid"]["investment"]["hardware"],
    value: number
  ) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => ({
      ...prev,
      financialGrid: {
        ...prev.financialGrid,
        investment: {
          ...prev.financialGrid.investment,
          [row]: {
            ...prev.financialGrid.investment[row],
            [column]: value
          }
        }
      }
    }));
  };

  const updateIncremental = (
    row: keyof FormState["financialGrid"]["incremental"],
    index: number,
    value: number
  ) => {
    if (isReadOnlyView) return;
    if (row === "years") return;
    setDirty(true);
    setForm((prev) => {
      const current = [...prev.financialGrid.incremental[row]];
      current[index] = value;
      return {
        ...prev,
        financialGrid: {
          ...prev.financialGrid,
          incremental: {
            ...prev.financialGrid.incremental,
            [row]: current
          }
        }
      };
    });
  };

  const setCommencementFiscalYear = (year: number) => {
    if (isReadOnlyView) return;
    setDirty(true);
    setForm((prev) => ({
      ...prev,
      financialGrid: {
        ...prev.financialGrid,
        commencementFiscalYear: year,
        incremental: {
          ...prev.financialGrid.incremental,
          years: [year + 1, year + 2, year + 3, year + 4, year + 5]
        }
      }
    }));
  };

  const navigateBackToProjects = useCallback(() => {
    if (!submissionId || dirty) {
      setShowUnsavedWarning(true);
      return;
    }
    router.push("/submissions");
  }, [dirty, router, submissionId]);

  const confirmLeaveWithoutSaving = useCallback(() => {
    setShowUnsavedWarning(false);
    router.push("/submissions");
  }, [router]);

  const cancelLeaveWithoutSaving = useCallback(() => {
    setShowUnsavedWarning(false);
  }, []);

  const saveDraft = useCallback(async (options?: { redirectOnSuccess?: boolean }): Promise<string | null> => {
    const redirectOnSuccess = options?.redirectOnSuccess ?? false;
    setSavingDraft(true);
    setError(null);

    try {
      if (isReadOnlyView) {
        setError(
          isSubmitterLockedAfterSponsorSubmit
            ? "Draft not saved. This submission is read-only while it is in a locked workflow stage."
            : "Draft not saved. Approvers have read-only access and cannot edit intake forms."
        );
        return null;
      }

      if (!validateDateOrder()) {
        setError(`Validation error in ${tabLabel("B. Sponsor & Timeline")} > Closure Date: ${DATE_ORDER_ERROR_MESSAGE}`);
        return null;
      }
      const humanResourceDateError = getHumanResourceDateError();
      if (humanResourceDateError) {
        setError(humanResourceDateError);
        return null;
      }

      const payload = buildSubmissionPayload();
      if (!submissionId) {
        const createResponse = await fetch("/api/submissions/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const createPayload = await createResponse.json();
        if (!createResponse.ok) {
          throw new Error(formatApiError(createPayload, "Failed to create draft"));
        }

        const createdId = createPayload.data.id as string;
        setSubmissionId(createdId);
        setWorkflowState(createPayload.data.workflow);
        setCurrentStage(createPayload.data.stage);
        setCurrentStatus(createPayload.data.status);
        setSubmissionAuditTrail(createPayload.data.auditTrail ?? []);
        setLastSavedAt(new Date().toLocaleTimeString());
        setDirty(false);

        if (redirectOnSuccess) {
          router.push(`/submissions?draftSaved=1&caseId=${encodeURIComponent(createdId)}`);
          router.refresh();
          return createdId;
        }

        setSuccess(`Draft saved: ${createdId}`);
        router.replace(`/submissions/${createdId}/edit`);
        return createdId;
      }

      const patchResponse = await fetch(`/api/submissions/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, status: "DRAFT" })
      });

      const patchPayload = await patchResponse.json();
      if (!patchResponse.ok) {
        throw new Error(formatApiError(patchPayload, "Failed to save draft"));
      }

      setWorkflowState(patchPayload.data.workflow);
      setCurrentStage(patchPayload.data.stage);
      setCurrentStatus(patchPayload.data.status);
      setSubmissionAuditTrail(patchPayload.data.auditTrail ?? []);
      setLastSavedAt(new Date().toLocaleTimeString());
      setDirty(false);

      if (redirectOnSuccess) {
        router.push(`/submissions?draftSaved=1&caseId=${encodeURIComponent(patchPayload.data.id as string)}`);
        router.refresh();
        return submissionId;
      }

      setSuccess(`Draft saved: ${patchPayload.data.id}`);
      return submissionId;
    } catch (saveError) {
      const errorMessage = saveError instanceof Error ? saveError.message : "Failed to save draft";
      setError(`Draft not saved. ${errorMessage}`);
      return null;
    } finally {
      setSavingDraft(false);
    }
  }, [
    buildSubmissionPayload,
    getHumanResourceDateError,
    isReadOnlyView,
    isSubmitterLockedAfterSponsorSubmit,
    router,
    submissionId,
    tabLabel,
    validateDateOrder
  ]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (isReadOnlyView) {
        setError(
          isSubmitterLockedAfterSponsorSubmit
            ? "This submission is read-only while it is in a locked workflow stage."
            : "Approvers have read-only access and cannot edit intake forms."
        );
        return;
      }

      if (!validateDateOrder()) {
        setError(`Validation error in ${tabLabel("B. Sponsor & Timeline")} > Closure Date: ${DATE_ORDER_ERROR_MESSAGE}`);
        setActiveTab(toDisplayTab("B. Sponsor & Timeline"));
        return;
      }
      const humanResourceDateError = getHumanResourceDateError();
      if (humanResourceDateError) {
        setError(humanResourceDateError);
        setActiveTab(toDisplayTab("B. Sponsor & Timeline"));
        return;
      }

      if (!form.category) {
        setError(
          `Validation error in ${tabLabel(toDisplayTab("C. Characteristics"))} > Project Category: Please select a project category.`
        );
        setActiveTab(toDisplayTab("C. Characteristics"));
        return;
      }

      const payload = buildSubmissionPayload();
      const submitAction: WorkflowAction = isBusinessCaseMode ? "SUBMIT_FUNDING_REQUEST" : "SEND_TO_SPONSOR";
      const routeToNextWorkflowStage = async (id: string) => {
        const routeResponse = await fetch(`/api/submissions/${id}/workflow-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: submitAction })
        });

        const routePayload = await routeResponse.json();
        if (!routeResponse.ok) {
          throw new Error(formatApiError(routePayload, "Failed to submit workflow action"));
        }

        return routePayload.data as ProjectSubmission;
      };

      if (!submissionId) {
        const response = await fetch("/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const createdPayload = await response.json();
        if (!response.ok) {
          throw new Error(formatApiError(createdPayload, "Failed to submit"));
        }

        const routed = await routeToNextWorkflowStage(createdPayload.data.id);
        const routedId = routed.id || createdPayload.data.id;
        if (!routedId) {
          throw new Error("Submission saved but the project ID was not returned.");
        }
        setWorkflowState(routed.workflow);
        setCurrentStage(routed.stage);
        setCurrentStatus(routed.status);
        setSubmissionAuditTrail(routed.auditTrail ?? []);
        setSuccess(
          isBusinessCaseMode
            ? `Funding request created and submitted for approvals: ${routedId}`
            : `Submission created and sent for sponsor approval: ${routedId}`
        );
        setDirty(false);
        router.replace(`/submissions/${encodeURIComponent(routedId)}/edit`);
        return;
      }

      const response = await fetch(`/api/submissions/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const updatedPayload = await response.json();
      if (!response.ok) {
        throw new Error(formatApiError(updatedPayload, "Failed to submit"));
      }

      const alreadyRouted =
        (isBusinessCaseMode &&
          updatedPayload.data.stage === "FUNDING" &&
          updatedPayload.data.status === "SPONSOR_REVIEW") ||
        (!isBusinessCaseMode &&
          updatedPayload.data.stage === "PROPOSAL" &&
          updatedPayload.data.status === "SPONSOR_REVIEW");
      const routed = alreadyRouted
        ? (updatedPayload.data as ProjectSubmission)
        : await routeToNextWorkflowStage(updatedPayload.data.id);

      setWorkflowState(routed.workflow);
      setCurrentStage(routed.stage);
      setCurrentStatus(routed.status);
      setSubmissionAuditTrail(routed.auditTrail ?? []);
      setSuccess(
        isBusinessCaseMode
          ? `Funding request submitted for approvals: ${routed.id}`
          : `Submission sent for sponsor approval: ${routed.id}`
      );
      setDirty(false);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!submissionId || !dirty) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      await saveDraft({ redirectOnSuccess: false });
    }, 1500);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [dirty, saveDraft, submissionId]);

  const allowedActions = useMemo(() => {
    return getAllowedWorkflowActions({
      stage: currentStage,
      status: currentStatus,
      workflow: effectiveWorkflowState
    });
  }, [currentStage, currentStatus, effectiveWorkflowState]);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const response = await fetch("/api/me");
        if (!response.ok) return;
        const payload = (await response.json()) as CurrentUser;
        if (payload?.email) {
          setCurrentUser(payload);
          setForm((prev) => ({
            ...prev,
            ownerName:
              prev.ownerName && prev.ownerName !== "Project Owner"
                ? prev.ownerName
                : payload.name || "Project Owner",
            ownerEmail:
              prev.ownerEmail && prev.ownerEmail !== "owner@portal.local"
                ? prev.ownerEmail
                : payload.email || "owner@portal.local"
          }));
        }
      } catch {
        // keep sponsor actions hidden when profile cannot be loaded
      }
    };

    void loadCurrentUser();
  }, []);

  useEffect(() => {
    const loadPortalUsers = async () => {
      try {
        const response = await fetch("/api/portal-users");
        if (!response.ok) return;
        const payload = await response.json();
        setPortalUsers(payload.data ?? []);
      } catch {
        // keep sponsor reassign available via manual choice fallback
      }
    };

    void loadPortalUsers();
  }, []);

  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const response = await fetch("/api/reference-data");
        if (!response.ok) return;
        const payload = await response.json();
        if (payload?.data) {
          setSelectOptions((prev) => ({ ...prev, ...payload.data }));
        }
      } catch {
        // retain defaults when service is unavailable
      }
    };

    void loadReferenceData();
  }, []);

  useEffect(() => {
    const loadBusinessCaseConfig = async () => {
      try {
        const response = await fetch("/api/business-case-config");
        if (!response.ok) return;
        const payload = await response.json();
        if (payload?.data) {
          setBusinessCaseConfig((prev) => ({ ...prev, ...payload.data }));
        }
      } catch {
        // retain defaults when service is unavailable
      }
    };

    void loadBusinessCaseConfig();
  }, []);

  return (
    <form onSubmit={onSubmit} className="w-full min-w-0 max-w-full space-y-6">
      <button
        type="button"
        onClick={navigateBackToProjects}
        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        ← Back to Projects
      </button>

      <section className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-brand-700 px-5 py-3 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-white/80">Strategic Projects Portal</p>
              <h3 className="text-xl font-semibold">{isBusinessCaseMode ? "Business Case" : "New Proposals"}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void saveDraft({ redirectOnSuccess: true });
                }}
                disabled={savingDraft || isReadOnlyView}
                className="rounded-md bg-black/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingDraft ? "Saving..." : "Save Draft"}
              </button>
              <button
                type="submit"
                disabled={submitting || isReadOnlyView}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-white/80">
            {submissionId
              ? `Project ID: ${submissionId}`
              : "Project ID will be generated on save"}
          </p>
        </div>

        <div className="min-w-0 px-5 py-4">
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => setActiveTab(tabs[tabIndex - 1])}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <div className="min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
              <div className="mx-auto flex w-max min-w-full items-center justify-center gap-3 whitespace-nowrap px-1">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`border-b-2 px-1 py-1 text-sm ${
                      activeTab === tab ? "border-brand-700 font-semibold text-brand-700" : "border-transparent text-slate-500"
                    }`}
                  >
                    {tabLabel(tab)}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setActiveTab(tabs[tabIndex + 1])}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">{lastSavedAt ? `Last autosave: ${lastSavedAt}` : "Autosave starts after first draft save."}</p>
        </div>

        <div className="w-full min-w-0 overflow-x-hidden border-t border-slate-200 px-5 py-5">
          {isSubmitterLockedAfterSponsorSubmit ? (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Read-only mode: this submission is locked in workflow and cannot be edited until it returns to a draft stage.
            </p>
          ) : null}
          <fieldset disabled={isReadOnlyView} className={`w-full min-w-0 max-w-full ${isReadOnlyView ? "opacity-95" : ""}`}>
          {activeSection === "A. Overview" && isBusinessCaseMode ? (
            <div className="space-y-6">
              <article className="rounded-lg border border-slate-200 p-4">
                <h4 className="text-base font-semibold text-slate-900">Introduction</h4>
                <div className="mt-3 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
                  <label className="text-sm md:col-span-3 xl:col-span-4">
                    Project Name
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.title}
                      onChange={(event) => update("title", event.target.value)}
                      placeholder="Enter official project name"
                      required
                    />
                  </label>
                  <label className="text-sm">
                    Current Year
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.introduction.currentYear}
                      onChange={(event) => {
                        const selectedYear = event.target.value;
                        const parsedYear = parseFiscalYear(selectedYear);
                        updateBusinessCaseField("introduction", "currentYear", selectedYear);
                        updateBusinessCaseField(
                          "introduction",
                          "endOfFiscalInCurrentYear",
                          getFiscalYearEndDate(parsedYear)
                        );
                      }}
                    >
                      <option value="">Select Current Year</option>
                      {currentYearOptions.map((year) => (
                        <option key={`business-case-current-year-${year}`} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    End of Fiscal in Current Year
                    <input
                      type="date"
                      className="mt-1 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-slate-700"
                      value={form.businessCase.introduction.endOfFiscalInCurrentYear}
                      readOnly
                    />
                  </label>
                  <label className="text-sm">
                    Funding Source
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.introduction.fundingSource}
                      onChange={(event) => updateBusinessCaseField("introduction", "fundingSource", event.target.value)}
                    >
                      <option value="">Select Funding Source</option>
                      {selectOptions.fundingSources.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Funding Type
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.introduction.fundingType}
                      onChange={(event) => updateBusinessCaseField("introduction", "fundingType", event.target.value)}
                    >
                      <option value="">Select Funding Type</option>
                      {selectOptions.fundingTypes.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <span>NDA Project</span>
                    <YesNoToggle
                      value={form.businessCase.introduction.ndaProject}
                      onChange={(value) => updateBusinessCaseField("introduction", "ndaProject", value)}
                      disabled={isReadOnlyView}
                    />
                  </label>
                  <label className="text-sm">
                    Project Category
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.category}
                      onChange={(event) => update("category", event.target.value)}
                      required
                    >
                      <option value="">Select Project Category</option>
                      {selectOptions.projectCategories.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Project Importance
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.introduction.projectImportance}
                      onChange={(event) => updateBusinessCaseField("introduction", "projectImportance", event.target.value)}
                    >
                      <option value="">Select Project Importance</option>
                      {selectOptions.projectImportanceLevels.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Project Complexity
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.introduction.projectComplexity}
                      onChange={(event) => updateBusinessCaseField("introduction", "projectComplexity", event.target.value)}
                    >
                      <option value="">Select Project Complexity</option>
                      {selectOptions.projectComplexityLevels.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Business Sponsor
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.introduction.businessSponsor}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (isReadOnlyView) return;
                        setDirty(true);
                        setForm((prev) => ({
                          ...prev,
                          businessSponsor: value,
                          sponsorName: value,
                          sponsorEmail: resolvePersonEmail(value, prev.sponsorEmail),
                          businessCase: {
                            ...prev.businessCase,
                            introduction: {
                              ...prev.businessCase.introduction,
                              businessSponsor: value
                            }
                          }
                        }));
                      }}
                    >
                      <option value="">Select Business Sponsor</option>
                      {personSelectorOptions.map((option) => (
                        <option key={`business-sponsor-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Business Delegate
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.introduction.businessDelegate}
                      onChange={(event) => updateBusinessCaseField("introduction", "businessDelegate", event.target.value)}
                    >
                      <option value="">Select Business Delegate</option>
                      {personSelectorOptions.map((option) => (
                        <option key={`business-delegate-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Technology Sponsor
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.introduction.technologySponsor}
                      onChange={(event) => updateBusinessCaseField("introduction", "technologySponsor", event.target.value)}
                    >
                      <option value="">Select Technology Sponsor</option>
                      {personSelectorOptions.map((option) => (
                        <option key={`technology-sponsor-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Finance Sponsor
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.introduction.financeSponsor}
                      onChange={(event) => updateBusinessCaseField("introduction", "financeSponsor", event.target.value)}
                    >
                      <option value="">Select Finance Sponsor</option>
                      {personSelectorOptions.map((option) => (
                        <option key={`finance-sponsor-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Benefits Sponsor
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.introduction.benefitsSponsor}
                      onChange={(event) => updateBusinessCaseField("introduction", "benefitsSponsor", event.target.value)}
                    >
                      <option value="">Select Benefits Sponsor</option>
                      {personSelectorOptions.map((option) => (
                        <option key={`benefits-sponsor-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <span>In Plan for Current Year</span>
                    <YesNoToggle
                      value={form.businessCase.introduction.inPlanForCurrentYear}
                      onChange={(value) => updateBusinessCaseField("introduction", "inPlanForCurrentYear", value)}
                      disabled={isReadOnlyView}
                    />
                  </label>
                </div>
              </article>

              <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-lg border border-slate-200 p-4">
                  <h4 className="text-base font-semibold text-slate-900">Project Overview</h4>
                  <label className="mt-3 block text-sm">
                    Project Description
                    <textarea
                      className="mt-1 h-28 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.summary}
                      onChange={(event) => update("summary", event.target.value)}
                      placeholder="Brief project description (max 530 characters)"
                      maxLength={530}
                    />
                  </label>
                  <label className="mt-3 block text-sm">
                    Opportunity Statement
                    <textarea
                      className="mt-1 h-24 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.projectOverview.opportunityStatement}
                      onChange={(event) => updateBusinessCaseField("projectOverview", "opportunityStatement", event.target.value)}
                    />
                  </label>
                </article>

                <article className="rounded-lg border border-slate-200 p-4">
                  <h4 className="text-base font-semibold text-slate-900">Scope / Schedule of Key Deliverables</h4>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <label className="text-sm">
                      Start
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                        value={form.startDate}
                        onChange={(event) => {
                          const nextStartDate = event.target.value;
                          setDirty(true);
                          setForm((prev) => ({
                            ...prev,
                            startDate: nextStartDate,
                            endDate:
                              prev.endDate && isEndBeforeStart(nextStartDate, prev.endDate)
                                ? nextStartDate
                                : prev.endDate
                          }));
                          setDateError(null);
                        }}
                      />
                    </label>
                    <label className="text-sm">
                      Go Live
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                        value={form.businessCase.scopeSchedule.goLive}
                        onChange={(event) => updateBusinessCaseField("scopeSchedule", "goLive", event.target.value)}
                      />
                    </label>
                    <label className="text-sm">
                      Benefit Realization Start
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                        value={form.businessCase.scopeSchedule.benefitRealizationStart}
                        onChange={(event) =>
                          updateBusinessCaseField("scopeSchedule", "benefitRealizationStart", event.target.value)
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Closure
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                        value={form.endDate}
                        min={form.startDate || undefined}
                        onChange={(event) => {
                          const nextEndDate = event.target.value;
                          if (isEndBeforeStart(form.startDate, nextEndDate)) {
                            setDateError(DATE_ORDER_ERROR_MESSAGE);
                            return;
                          }

                          setDateError(null);
                          update("endDate", nextEndDate);
                        }}
                      />
                    </label>
                    {dateError ? <p className="text-sm text-red-700 md:col-span-2 xl:col-span-3">{dateError}</p> : null}
                  </div>
                </article>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <article className="rounded-lg border border-slate-200 p-4">
                  <h4 className="text-base font-semibold text-slate-900">User Experience</h4>
                  <p className="mt-2 text-xs text-slate-500">
                    Select the CE contribution vs CE negative impact quadrant for this project.
                  </p>
                  <label className="mt-3 block w-full max-w-sm text-sm">
                    User Experience Impact
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.userExperience.userExperienceImpact}
                      onChange={(event) =>
                        updateBusinessCaseField("userExperience", "userExperienceImpact", event.target.value)
                      }
                    >
                      <option value="">Select User Experience Impact</option>
                      {selectOptions.userExperienceImpacts.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-4 grid items-start justify-start gap-2 sm:grid-cols-[28px_auto_56px]">
                    <div
                      className="flex h-full items-center justify-center text-center text-xs font-semibold tracking-wide text-brand-700"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                    >
                      CE Negative Impact
                    </div>
                    <div className="w-[30rem] max-w-full">
                      <div className="mb-2 grid grid-cols-3 text-[11px] font-semibold text-slate-600">
                        <span className="text-left">Low</span>
                        <span className="text-center">Med</span>
                        <span className="text-right">High</span>
                      </div>
                      <div className="grid aspect-square grid-cols-2 grid-rows-2 overflow-hidden rounded-md border border-slate-400">
                        {ceMatrixOptions.map((cell) => {
                          const isSelected =
                            form.businessCase.userExperience.userExperienceQuadrant.trim().toUpperCase() === cell.key;
                          return (
                            <button
                              key={cell.key}
                              type="button"
                              disabled={isReadOnlyView}
                              onClick={() => updateBusinessCaseField("userExperience", "userExperienceQuadrant", cell.key)}
                              className={`h-full w-full border border-slate-300 px-3 py-2 text-left transition ${
                                isSelected
                                  ? "bg-brand-700 text-white"
                                  : "bg-white text-slate-800 hover:bg-brand-50"
                              } disabled:cursor-not-allowed disabled:opacity-70`}
                            >
                              <span className="block text-2xl font-semibold leading-none">{cell.title}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-center text-xs font-semibold tracking-wide text-brand-700">
                        CE Contribution
                      </p>
                    </div>
                    <div className="flex h-full flex-col justify-between py-2 text-right text-[11px] font-semibold text-slate-600">
                      <span>High</span>
                      <span>Med</span>
                      <span>Low</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-600">
                    Selected Quadrant:{" "}
                    <span className="font-semibold">
                      {form.businessCase.userExperience.userExperienceQuadrant || "None"}
                    </span>
                  </p>
                  <label className="mt-3 block text-sm">
                    Impact Description
                    <textarea
                      className="mt-1 h-24 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.userExperience.impactDescription}
                      onChange={(event) => updateBusinessCaseField("userExperience", "impactDescription", event.target.value)}
                    />
                  </label>
                </article>

                <div className="space-y-4">
                  <article className="rounded-lg border border-slate-200 p-4">
                    <h4 className="text-base font-semibold text-slate-900">Strategy Alignment</h4>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <label className="text-sm">
                        Enterprise Strategy Alignment
                        <textarea
                          className="mt-1 h-24 w-full rounded-md border border-slate-300 px-3 py-2"
                          value={form.businessCase.strategyAlignment.enterpriseStrategyAlignment}
                          onChange={(event) =>
                            updateBusinessCaseField("strategyAlignment", "enterpriseStrategyAlignment", event.target.value)
                          }
                        />
                      </label>
                      <label className="text-sm">
                        Key Dependencies
                        <textarea
                          className="mt-1 h-24 w-full rounded-md border border-slate-300 px-3 py-2"
                          value={form.businessCase.strategyAlignment.keyDependencies}
                          onChange={(event) =>
                            updateBusinessCaseField("strategyAlignment", "keyDependencies", event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </article>

                  <article className="rounded-lg border border-slate-200 p-4">
                    <h4 className="text-base font-semibold text-slate-900">Risk and Mitigation</h4>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="w-full max-w-xl text-sm md:col-span-2">
                        Risk Assessment Required
                        <select
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                          value={form.businessCase.riskMitigation.riskAssessmentRequired}
                          onChange={(event) =>
                            updateBusinessCaseField("riskMitigation", "riskAssessmentRequired", event.target.value)
                          }
                        >
                          <option value="">Select Risk Assessment Required</option>
                          {selectOptions.riskAssessmentRequiredOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      {shouldShowCiraDetails ? (
                        <>
                          <label className="text-sm">
                            CIRA Reference Name
                            <input
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                              value={form.businessCase.riskMitigation.ciraReferenceName}
                              onChange={(event) =>
                                updateBusinessCaseField("riskMitigation", "ciraReferenceName", event.target.value)
                              }
                            />
                          </label>
                          <label className="text-sm">
                            CIRA Reference #
                            <input
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                              value={form.businessCase.riskMitigation.ciraReferenceNumber}
                              onChange={(event) =>
                                updateBusinessCaseField("riskMitigation", "ciraReferenceNumber", event.target.value)
                              }
                            />
                          </label>
                          <label className="text-sm md:col-span-2">
                            High and Medium Inherent Risk
                            <textarea
                              className="mt-1 h-24 w-full rounded-md border border-slate-300 px-3 py-2"
                              value={form.businessCase.riskMitigation.highMediumInherentRisk}
                              onChange={(event) =>
                                updateBusinessCaseField("riskMitigation", "highMediumInherentRisk", event.target.value)
                              }
                            />
                          </label>
                        </>
                      ) : null}
                    </div>
                  </article>
                </div>
              </div>

              {shouldShowInvestmentRegulationSection ? (
                <article className="rounded-lg border border-slate-200 p-4">
                  <h4 className="text-base font-semibold text-slate-900">Investment / Regulation and Solution (Optional)</h4>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-sm">
                      Regulatory / Governing Body
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                        value={form.businessCase.investmentRegulationSolution.regulatoryGoverningBody}
                        onChange={(event) =>
                          updateBusinessCaseField("investmentRegulationSolution", "regulatoryGoverningBody", event.target.value)
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Specific Regulation Name (or Deficiency ID)
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                        value={form.businessCase.investmentRegulationSolution.specificRegulationNameOrDeficiencyId}
                        onChange={(event) =>
                          updateBusinessCaseField(
                            "investmentRegulationSolution",
                            "specificRegulationNameOrDeficiencyId",
                            event.target.value
                          )
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Implementation Due Date
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                        value={form.businessCase.investmentRegulationSolution.implementationDueDate}
                        onChange={(event) =>
                          updateBusinessCaseField("investmentRegulationSolution", "implementationDueDate", event.target.value)
                        }
                      />
                    </label>
                  </div>
                </article>
              ) : null}
            </div>
          ) : null}

          {activeSection === "B. Sponsor & Timeline" && isBusinessCaseMode ? (
            <div className="min-w-0 w-full space-y-6">
              <div className="grid min-w-0 gap-4">
                <article className="w-full min-w-0 rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-base font-semibold text-slate-900">Human Resources</h4>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => scrollHumanResourcesTable("left")}
                        className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollHumanResourcesTable("right")}
                        className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        onClick={addHumanResourceRow}
                        disabled={isReadOnlyView}
                        className="rounded-md bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add Row
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Add one row per required resource. Use arrows or horizontal swipe/scroll to view more columns.
                  </p>
                  <div className="mt-3 w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <div
                      ref={humanResourcesScrollRef}
                      className="table-scroll-x w-full max-w-full overflow-x-scroll overflow-y-visible overscroll-x-contain pb-1 touch-pan-x [scrollbar-gutter:stable]"
                    >
                    <table className="w-max min-w-[4200px] table-fixed border-collapse text-sm">
                      <colgroup>
                        <col className="w-[220px]" />
                        <col className="w-[260px]" />
                        <col className="w-[150px]" />
                        <col className="w-[140px]" />
                        <col className="w-[170px]" />
                        <col className="w-[180px]" />
                        <col className="w-[220px]" />
                        <col className="w-[130px]" />
                        <col className="w-[150px]" />
                        <col className="w-[150px]" />
                        <col className="w-[190px]" />
                        <col className="w-[130px]" />
                        <col className="w-[150px]" />
                        <col className="w-[180px]" />
                        <col className="w-[180px]" />
                        <col className="w-[180px]" />
                        <col className="w-[180px]" />
                        <col className="w-[180px]" />
                        <col className="w-[180px]" />
                        <col className="w-[180px]" />
                        <col className="w-[180px]" />
                        <col className="w-[180px]" />
                        <col className="w-[180px]" />
                        <col className="w-[170px]" />
                        <col className="w-[110px]" />
                      </colgroup>
                      <thead>
                        <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <th className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-center">Role Description</th>
                          <th className="border border-slate-200 px-3 py-2 text-center">Responsibilities</th>
                          <th className="border border-slate-200 px-3 py-2 text-center">Resource Type</th>
                          <th className="border border-slate-200 px-3 py-2 text-center">Pay Grade</th>
                          <th className="border border-slate-200 px-3 py-2 text-center">Monthly Salary USD</th>
                          <th className="border border-slate-200 px-3 py-2 text-center">Resource Name</th>
                          <th className="border border-slate-200 px-3 py-2 text-center">Comments</th>
                          <th className="border border-slate-200 px-3 py-2 text-center">CAPEX/ OPEX</th>
                          <th className="border border-slate-200 px-3 py-2 text-center">Resource Start Date</th>
                          <th className="border border-slate-200 px-3 py-2 text-center">Resource End Date</th>
                          <th className="border border-slate-200 px-3 py-2 text-center">
                            Length of Time on Project (Months)
                          </th>
                          <th className="border border-slate-200 px-3 py-2 text-center">Hiring Required</th>
                          <th className="border border-slate-200 px-3 py-2 text-center">Average % Allocation</th>
                          <th className="border border-slate-200 px-3 py-2 text-center">
                            Total Resource Costs F{resourceCostCurrentYear} Q1 USD
                          </th>
                          <th className="border border-slate-200 px-3 py-2 text-center">
                            Total Resource Costs F{resourceCostCurrentYear} Q2 USD
                          </th>
                          <th className="border border-slate-200 px-3 py-2 text-center">
                            Total Resource Costs F{resourceCostCurrentYear} Q3 USD
                          </th>
                          <th className="border border-slate-200 px-3 py-2 text-center">
                            Total Resource Costs F{resourceCostCurrentYear} Q4 USD
                          </th>
                          <th className="border border-slate-200 px-3 py-2 text-center">
                            Total Resource Costs F{resourceCostYears[0]} USD
                          </th>
                          <th className="border border-slate-200 px-3 py-2 text-center">
                            Total Resource Costs F{resourceCostYears[1]} USD
                          </th>
                          <th className="border border-slate-200 px-3 py-2 text-center">
                            Total Resource Costs F{resourceCostYears[2]} USD
                          </th>
                          <th className="border border-slate-200 px-3 py-2 text-center">
                            Total Resource Costs F{resourceCostYears[3]} USD
                          </th>
                          <th className="border border-slate-200 px-3 py-2 text-center">
                            Total Resource Costs F{resourceCostYears[4]} USD
                          </th>
                          <th className="border border-slate-200 px-3 py-2 text-center">
                            Total Resource Costs F{resourceCostYears[5]} USD
                          </th>
                          <th className="border border-slate-200 px-3 py-2 text-center">Total Resource Costs USD</th>
                          <th className="border border-slate-200 px-3 py-2 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.businessCase.resourceRequirements.humanResources.map((row, index) => {
                          const monthlySalary = getPayGradeMonthlySalaryUsd(row.payGrade, payGradeMonthlySalaryUsd);
                          const lengthInMonths = getResourceLengthMonths(row.resourceStartDate, row.resourceEndDate);
                          const costBreakdown = calculateHumanResourceCostBreakdown(
                            row,
                            payGradeMonthlySalaryUsd,
                            resourceCostCurrentYear
                          );
                          const formatCostValue = (value: number) =>
                            costBreakdown.hasData ? number.format(value) : "";

                          return (
                            <tr key={row.id || `human-resource-${index + 1}`} className="align-top">
                              <td className="sticky left-0 z-10 border border-slate-200 bg-white p-2">
                                <input
                                  aria-label={`Role Description ${index + 1}`}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                                  value={row.roleDescription}
                                  onChange={(event) => updateHumanResourceRow(index, "roleDescription", event.target.value)}
                                />
                              </td>
                              <td className="border border-slate-200 p-2">
                                <textarea
                                  aria-label={`Responsibilities ${index + 1}`}
                                  className="h-20 w-full rounded-md border border-slate-300 px-3 py-2"
                                  value={row.responsibilities}
                                  onChange={(event) => updateHumanResourceRow(index, "responsibilities", event.target.value)}
                                />
                              </td>
                              <td className="border border-slate-200 p-2">
                                <select
                                  aria-label={`Resource Type ${index + 1}`}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                                  value={row.resourceType}
                                  onChange={(event) => updateHumanResourceRow(index, "resourceType", event.target.value)}
                                >
                                  <option value="">Select</option>
                                  {selectOptions.resourceTypes.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="border border-slate-200 p-2">
                                <select
                                  aria-label={`Pay Grade ${index + 1}`}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                                  value={row.payGrade}
                                  onChange={(event) => updateHumanResourceRow(index, "payGrade", event.target.value)}
                                >
                                  <option value="">Select</option>
                                  {payGradeOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="border border-slate-200 p-2">
                                <input
                                  aria-label={`Monthly Salary USD ${index + 1}`}
                                  className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-right text-slate-700"
                                  value={monthlySalary === null ? "" : number.format(monthlySalary)}
                                  readOnly
                                />
                              </td>
                              <td className="border border-slate-200 p-2">
                                <input
                                  aria-label={`Resource Name ${index + 1}`}
                                  list="human-resource-name-options"
                                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                                  value={row.resourceName}
                                  onChange={(event) => updateHumanResourceRow(index, "resourceName", event.target.value)}
                                />
                              </td>
                              <td className="border border-slate-200 p-2">
                                <textarea
                                  aria-label={`Comments ${index + 1}`}
                                  className="h-20 w-full rounded-md border border-slate-300 px-3 py-2"
                                  value={row.comments}
                                  onChange={(event) => updateHumanResourceRow(index, "comments", event.target.value)}
                                />
                              </td>
                              <td className="border border-slate-200 p-2">
                                <select
                                  aria-label={`CAPEX or OPEX ${index + 1}`}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                                  value={row.capexOpex}
                                  onChange={(event) => updateHumanResourceRow(index, "capexOpex", event.target.value)}
                                >
                                  <option value="">Select</option>
                                  {selectOptions.capexOpexTypes.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="border border-slate-200 p-2">
                                <input
                                  type="date"
                                  aria-label={`Resource Start Date ${index + 1}`}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                                  value={row.resourceStartDate}
                                  max={row.resourceEndDate || undefined}
                                  onChange={(event) =>
                                    updateHumanResourceRow(index, "resourceStartDate", event.target.value)
                                  }
                                />
                              </td>
                              <td className="border border-slate-200 p-2">
                                <input
                                  type="date"
                                  aria-label={`Resource End Date ${index + 1}`}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                                  value={row.resourceEndDate}
                                  min={row.resourceStartDate || undefined}
                                  onChange={(event) => updateHumanResourceRow(index, "resourceEndDate", event.target.value)}
                                />
                              </td>
                              <td className="border border-slate-200 p-2">
                                <input
                                  aria-label={`Length of Time on Project Months ${index + 1}`}
                                  className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-right text-slate-700"
                                  value={lengthInMonths === null ? "" : number.format(lengthInMonths)}
                                  readOnly
                                />
                              </td>
                              <td className="border border-slate-200 p-2">
                                <div className="flex justify-center">
                                  <YesNoToggle
                                    value={row.hiringRequired}
                                    onChange={(value) => updateHumanResourceRow(index, "hiringRequired", value)}
                                    disabled={isReadOnlyView}
                                  />
                                </div>
                              </td>
                              <td className="border border-slate-200 p-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step="0.1"
                                  aria-label={`Average Allocation ${index + 1}`}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                                  value={row.averageAllocationPct}
                                  onChange={(event) =>
                                    updateHumanResourceRow(index, "averageAllocationPct", event.target.value)
                                  }
                                />
                              </td>
                              <td className="border border-slate-200 p-2">
                                <input
                                  aria-label={`Total Resource Costs F${resourceCostCurrentYear} Q1 USD ${index + 1}`}
                                  className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-right text-slate-700"
                                  value={formatCostValue(costBreakdown.q1)}
                                  readOnly
                                />
                              </td>
                              <td className="border border-slate-200 p-2">
                                <input
                                  aria-label={`Total Resource Costs F${resourceCostCurrentYear} Q2 USD ${index + 1}`}
                                  className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-right text-slate-700"
                                  value={formatCostValue(costBreakdown.q2)}
                                  readOnly
                                />
                              </td>
                              <td className="border border-slate-200 p-2">
                                <input
                                  aria-label={`Total Resource Costs F${resourceCostCurrentYear} Q3 USD ${index + 1}`}
                                  className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-right text-slate-700"
                                  value={formatCostValue(costBreakdown.q3)}
                                  readOnly
                                />
                              </td>
                              <td className="border border-slate-200 p-2">
                                <input
                                  aria-label={`Total Resource Costs F${resourceCostCurrentYear} Q4 USD ${index + 1}`}
                                  className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-right text-slate-700"
                                  value={formatCostValue(costBreakdown.q4)}
                                  readOnly
                                />
                              </td>
                              {costBreakdown.yearly.map((yearCost, yearIndex) => (
                                <td
                                  key={`resource-cost-year-${row.id || index}-${resourceCostYears[yearIndex]}`}
                                  className="border border-slate-200 p-2"
                                >
                                  <input
                                    aria-label={`Total Resource Costs F${resourceCostYears[yearIndex]} USD ${index + 1}`}
                                    className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-right text-slate-700"
                                    value={formatCostValue(yearCost)}
                                    readOnly
                                  />
                                </td>
                              ))}
                              <td className="border border-slate-200 p-2">
                                <input
                                  aria-label={`Total Resource Costs USD ${index + 1}`}
                                  className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-right text-slate-700"
                                  value={formatCostValue(costBreakdown.total)}
                                  readOnly
                                />
                              </td>
                              <td className="border border-slate-200 p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeHumanResourceRow(index)}
                                  disabled={
                                    isReadOnlyView || form.businessCase.resourceRequirements.humanResources.length <= 1
                                  }
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                    <datalist id="human-resource-name-options">
                      {staffNameOptions.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </div>
                </article>
              </div>

              <article className="w-full min-w-0 rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-base font-semibold text-slate-900">Technology Application Resources</h4>
                  <button
                    type="button"
                    onClick={addTechnologyApplicationResourceRow}
                    disabled={isReadOnlyView}
                    className="rounded-md bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add Row
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Add one row per impacted application.
                </p>
                <div className="mt-3 w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="table-scroll-x w-full max-w-full overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
                  <table className="w-full min-w-[1320px] table-fixed border-collapse text-sm">
                    <colgroup>
                      <col className="w-[16%]" />
                      <col className="w-[18%]" />
                      <col className="w-[16%]" />
                      <col className="w-[20%]" />
                      <col className="w-[12%]" />
                      <col className="w-[12%]" />
                      <col className="w-[6%]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-center">Impacted Application</th>
                        <th className="border border-slate-200 px-3 py-2 text-center">Availability Application Tier</th>
                        <th className="border border-slate-200 px-3 py-2 text-center">Strategic / Non-Strategic</th>
                        <th className="border border-slate-200 px-3 py-2 text-center">Rationale for Completing Work</th>
                        <th className="border border-slate-200 px-3 py-2 text-center">New Application?</th>
                        <th className="border border-slate-200 px-3 py-2 text-center">Decommission Opportunity?</th>
                        <th className="border border-slate-200 px-3 py-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.businessCase.resourceRequirements.technologyApplicationResources.map((row, index) => (
                        <tr key={row.id || `app-resource-${index + 1}`} className="align-top">
                          <td className="sticky left-0 z-10 border border-slate-200 bg-white p-2">
                            <input
                              aria-label={`Impacted Application ${index + 1}`}
                              className="w-full rounded-md border border-slate-300 px-3 py-2"
                              value={row.impactedApplication}
                              onChange={(event) =>
                                updateTechnologyApplicationResourceRow(index, "impactedApplication", event.target.value)
                              }
                            />
                          </td>
                          <td className="border border-slate-200 p-2">
                            <select
                              aria-label={`Availability Application Tier ${index + 1}`}
                              className="w-full rounded-md border border-slate-300 px-3 py-2"
                              value={row.availabilityApplicationTier}
                              onChange={(event) =>
                                updateTechnologyApplicationResourceRow(
                                  index,
                                  "availabilityApplicationTier",
                                  event.target.value
                                )
                              }
                            >
                              <option value="">Select Tier</option>
                              {selectOptions.availabilityApplicationTiers.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="border border-slate-200 p-2">
                            <select
                              aria-label={`Strategic or Non-Strategic ${index + 1}`}
                              className="w-full rounded-md border border-slate-300 px-3 py-2"
                              value={row.strategicOrNonStrategic}
                              onChange={(event) =>
                                updateTechnologyApplicationResourceRow(index, "strategicOrNonStrategic", event.target.value)
                              }
                            >
                              <option value="">Select</option>
                              {selectOptions.strategicNonStrategicOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="border border-slate-200 p-2">
                            <textarea
                              aria-label={`Rationale for Completing Work ${index + 1}`}
                              className="h-20 w-full rounded-md border border-slate-300 px-3 py-2"
                              value={row.rationaleForCompletingWork}
                              onChange={(event) =>
                                updateTechnologyApplicationResourceRow(
                                  index,
                                  "rationaleForCompletingWork",
                                  event.target.value
                                )
                              }
                            />
                          </td>
                          <td className="border border-slate-200 p-2">
                            <div className="flex justify-center">
                              <YesNoToggle
                                value={row.introducesNewApplication}
                                onChange={(value) =>
                                  updateTechnologyApplicationResourceRow(index, "introducesNewApplication", value)
                                }
                                disabled={isReadOnlyView}
                              />
                            </div>
                          </td>
                          <td className="border border-slate-200 p-2">
                            <div className="flex justify-center">
                              <YesNoToggle
                                value={row.decommissionOpportunity}
                                onChange={(value) =>
                                  updateTechnologyApplicationResourceRow(index, "decommissionOpportunity", value)
                                }
                                disabled={isReadOnlyView}
                              />
                            </div>
                          </td>
                          <td className="border border-slate-200 p-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeTechnologyApplicationResourceRow(index)}
                              disabled={isReadOnlyView || form.businessCase.resourceRequirements.technologyApplicationResources.length <= 1}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </article>
              <article className="w-full min-w-0 rounded-lg border border-slate-200 p-4">
                <h4 className="text-base font-semibold text-slate-900">Resource Requirement Summary</h4>
                <p className="mt-2 text-xs text-slate-500">
                  Auto-populated from Human Resources and Technology Application Resources.
                </p>
                <div className="mt-3 table-scroll-x w-full max-w-full overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
                  <table className="w-full min-w-[880px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="w-72 border border-slate-200 px-3 py-2 text-center">Requirement</th>
                        <th className="border border-slate-200 px-3 py-2 text-center">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="align-top">
                        <td className="border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700">
                          Internal Requirements
                        </td>
                        <td className="border border-slate-200 p-2">
                          <textarea
                            className="h-20 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none"
                            value={resourceRequirementSummary.internalFteRequirements}
                            readOnly
                            maxLength={4000}
                          />
                        </td>
                      </tr>
                      <tr className="align-top">
                        <td className="border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700">
                          External Support Required
                        </td>
                        <td className="border border-slate-200 p-2">
                          <textarea
                            className="h-20 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none"
                            value={resourceRequirementSummary.externalSupportRequired}
                            readOnly
                            maxLength={4000}
                          />
                        </td>
                      </tr>
                      <tr className="align-top">
                        <td className="border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700">
                          Hiring Required
                        </td>
                        <td className="border border-slate-200 p-2">
                          <textarea
                            className="h-20 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none"
                            value={resourceRequirementSummary.hiringRequired}
                            readOnly
                            maxLength={4000}
                          />
                        </td>
                      </tr>
                      <tr className="align-top">
                        <td className="border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700">
                          Additional Resource Details
                        </td>
                        <td className="border border-slate-200 p-2">
                          <textarea
                            className="h-24 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none"
                            value={resourceRequirementSummary.additionalResourceDetails}
                            readOnly
                            maxLength={4000}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          ) : null}

          {activeSection === "C. Characteristics" && isBusinessCaseMode ? (
            <div className="min-w-0 w-full flex flex-col gap-6">
              <article className="order-3 w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-200">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h4 className="text-base font-semibold text-slate-900">Capital Expenses</h4>
                  <p className="text-xs text-slate-500">Highlighted cells are user inputs. Totals are calculated.</p>
                </div>

                <div className="table-scroll-x w-full max-w-full overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
                  <table className="w-max min-w-[1980px] border-r border-slate-200 text-xs">
                    <thead className="sticky top-0 z-20 bg-slate-50 text-slate-700">
                      <tr>
                        <th
                          className="sticky left-0 z-30 w-72 min-w-[18rem] max-w-[18rem] border-b border-slate-200 bg-slate-50 px-3 py-2 text-center"
                          rowSpan={2}
                        >
                          Financial Model & Notes
                        </th>
                        <th className="w-20 border-b border-slate-200 px-2 py-2 text-center" rowSpan={2}>
                          Qty
                        </th>
                        <th className="w-24 border-b border-slate-200 px-2 py-2 text-center" rowSpan={2}>
                          Unit Cost
                        </th>
                        <th className="w-24 border-b border-slate-200 px-2 py-2 text-center" rowSpan={2}>
                          Total Cost
                        </th>
                        <th className="w-40 border-b border-slate-200 px-2 py-2 text-center" rowSpan={2}>
                          Comments
                        </th>
                        <th className="w-20 border-b border-slate-200 px-2 py-2 text-center" rowSpan={2}>
                          Useful Life (Yrs)
                        </th>
                        <th className="w-24 border-b border-slate-200 px-2 py-2 text-center" rowSpan={2}>
                          Annual Depreciation
                        </th>
                        <th className="border-b border-slate-200 px-2 py-2 text-center" colSpan={6}>
                          Spend Schedule
                        </th>
                        <th className="border-b border-slate-200 px-2 py-2 text-center" colSpan={6}>
                          Timing of Project Spend
                        </th>
                      </tr>
                      <tr>
                        <th className="w-20 border-b border-slate-200 px-2 py-2 text-center">Prior FY(s)</th>
                        <th className="w-20 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[0]} Q1`}</th>
                        <th className="w-20 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[0]} Q2`}</th>
                        <th className="w-20 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[0]} Q3`}</th>
                        <th className="w-20 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[0]} Q4`}</th>
                        <th className="w-24 border-b border-slate-200 px-2 py-2 text-center">Total</th>
                        <th className="w-20 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[0]} Plan`}</th>
                        <th className="w-20 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[1]}`}</th>
                        <th className="w-20 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[2]}`}</th>
                        <th className="w-20 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[3]}`}</th>
                        <th className="w-20 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[4]}`}</th>
                        <th className="w-20 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[5]}`}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {capitalExpenseRows.flatMap((row, index) => {
                        const showGroupHeader = index === 0 || capitalExpenseRows[index - 1].group !== row.group;
                        const scheduleTotal = getCapitalScheduleTotal(row);
                        const isAutoCalculatedRow =
                          row.isTotal || row.id === "contingency" || row.id === "withholding-tax";
                        const canEditRow = !isReadOnlyView && !isAutoCalculatedRow;
                        const editableClass = "bg-brand-100";
                        const readonlyClass = "bg-slate-100 text-slate-600";
                        const inputBaseClass =
                          "h-7 rounded border border-slate-300 px-2 py-1 text-right text-xs outline-none focus:ring-2 focus:ring-brand-200";

                        const renderedRows = [];
                        if (showGroupHeader) {
                          renderedRows.push(
                            <tr key={`${row.id}-group`} className="bg-slate-100/70">
                              <td className="px-3 py-2 font-semibold text-slate-700" colSpan={19}>
                                {row.group}
                              </td>
                            </tr>
                          );
                        }

                        renderedRows.push(
                          <tr key={row.id} className={`border-t border-slate-100 ${row.isTotal ? "font-semibold" : ""}`}>
                            <td className="sticky left-0 z-10 w-72 min-w-[18rem] max-w-[18rem] whitespace-normal break-words bg-white px-3 py-2 text-slate-900">
                              {row.label}
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                className={`${inputBaseClass} mx-auto w-20 ${canEditRow ? editableClass : readonlyClass}`}
                                value={row.quantity}
                                onChange={(event) =>
                                  updateCapitalExpenseRowNumber(index, "quantity", Number(event.target.value || 0))
                                }
                                disabled={!canEditRow}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                className={`${inputBaseClass} mx-auto w-24 ${canEditRow ? editableClass : readonlyClass}`}
                                value={row.unitCost}
                                onChange={(event) =>
                                  updateCapitalExpenseRowNumber(index, "unitCost", Number(event.target.value || 0))
                                }
                                disabled={!canEditRow}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                className={`${inputBaseClass} mx-auto w-24 ${readonlyClass}`}
                                value={row.totalCost}
                                disabled
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                className={`h-7 w-40 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${canEditRow ? editableClass : readonlyClass}`}
                                value={row.comments}
                                onChange={(event) => updateCapitalExpenseRowComment(index, event.target.value)}
                                disabled={!canEditRow}
                                maxLength={500}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                className={`${inputBaseClass} mx-auto w-20 ${readonlyClass}`}
                                value={depreciationYearsByLabel.get(row.label.trim()) ?? 0}
                                disabled
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                className={`${inputBaseClass} mx-auto w-24 ${readonlyClass}`}
                                value={row.annualDepreciation}
                                disabled
                              />
                            </td>
                            {capitalScheduleFields.map((field) => (
                              <td key={`${row.id}-${field}`} className="px-2 py-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  inputMode="decimal"
                                  className={`${inputBaseClass} mx-auto w-20 ${canEditRow ? editableClass : readonlyClass}`}
                                  value={row[field]}
                                  onChange={(event) =>
                                    updateCapitalExpenseRowNumber(index, field, Number(event.target.value || 0))
                                  }
                                  disabled={!canEditRow}
                                />
                              </td>
                            ))}
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                className={`${inputBaseClass} mx-auto w-24 ${readonlyClass}`}
                                value={scheduleTotal}
                                disabled
                              />
                            </td>
                            {capitalTimingFields.map((field) => (
                              <td key={`${row.id}-${field}`} className="px-2 py-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  inputMode="decimal"
                                  className={`${inputBaseClass} mx-auto w-20 ${canEditRow ? editableClass : readonlyClass}`}
                                  value={row[field]}
                                  onChange={(event) =>
                                    updateCapitalExpenseRowNumber(index, field, Number(event.target.value || 0))
                                  }
                                  disabled={!canEditRow}
                                />
                              </td>
                            ))}
                          </tr>
                        );

                        return renderedRows;
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-4 border-t border-slate-200 px-4 py-4 md:grid-cols-[220px_220px_1fr]">
                  <label className="text-xs font-semibold text-slate-700">
                    Project Contingency
                    <div className="mt-1 flex items-center rounded-md border border-slate-300 bg-brand-100 px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        className="w-full bg-transparent text-right outline-none"
                        value={form.businessCase.capitalExpenses.projectContingencyPct}
                        onChange={(event) =>
                          updateCapitalExpenseSetting("projectContingencyPct", Number(event.target.value || 0))
                        }
                        disabled={isReadOnlyView}
                      />
                      <span className="ml-1 text-slate-600">%</span>
                    </div>
                  </label>
                  <label className="text-xs font-semibold text-slate-700">
                    Withholding Tax Rate
                    <div className="mt-1 flex items-center rounded-md border border-slate-300 bg-brand-100 px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        className="w-full bg-transparent text-right outline-none"
                        value={form.businessCase.capitalExpenses.withholdingTaxRatePct}
                        onChange={(event) =>
                          updateCapitalExpenseSetting("withholdingTaxRatePct", Number(event.target.value || 0))
                        }
                        disabled={isReadOnlyView}
                      />
                      <span className="ml-1 text-slate-600">%</span>
                    </div>
                  </label>
                  <label className="text-xs font-semibold text-slate-700">
                    Note
                    <input
                      className={`mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs ${
                        isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                      }`}
                      value={form.businessCase.capitalExpenses.withholdingTaxNote}
                      onChange={(event) => updateCapitalExpenseSetting("withholdingTaxNote", event.target.value)}
                      maxLength={500}
                      disabled={isReadOnlyView}
                    />
                  </label>
                </div>
              </article>

              <article className="order-4 w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-200">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h4 className="text-base font-semibold text-slate-900">Depreciation Summary</h4>
                  <p className="text-xs text-slate-500">Highlighted cells are user inputs. Totals are auto-calculated.</p>
                </div>

                <div className="table-scroll-x w-full max-w-full overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
                  <table className="w-max min-w-[2280px] border-r border-slate-200 text-xs">
                    <thead className="sticky top-0 z-20 bg-slate-50 text-slate-700">
                      <tr>
                        <th className="w-40 border-b border-slate-200 px-2 py-2 text-center">Phase</th>
                        <th className="w-36 border-b border-slate-200 px-2 py-2 text-center">Category</th>
                        <th className="w-44 border-b border-slate-200 px-2 py-2 text-center">Capex/Prepaid Category</th>
                        <th className="w-32 border-b border-slate-200 px-2 py-2 text-center">Phase Start Date</th>
                        <th className="w-32 border-b border-slate-200 px-2 py-2 text-center">Phase End Date</th>
                        <th className="w-24 border-b border-slate-200 px-2 py-2 text-center">Useful Life (Yrs)</th>
                        <th className="w-28 border-b border-slate-200 px-2 py-2 text-center">Total Project Cost</th>
                        <th className="w-28 border-b border-slate-200 px-2 py-2 text-center">Project Cost For Phase</th>
                        <th className="w-28 border-b border-slate-200 px-2 py-2 text-center">Annual Depreciation</th>
                        <th className="w-24 border-b border-slate-200 px-2 py-2 text-center">Prior FY(s)</th>
                        <th className="w-24 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[0]}`}</th>
                        <th className="w-24 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[1]}`}</th>
                        <th className="w-24 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[2]}`}</th>
                        <th className="w-24 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[3]}`}</th>
                        <th className="w-24 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[4]}`}</th>
                        <th className="w-24 border-b border-slate-200 px-2 py-2 text-center">{`F${resourceCostYears[5]}`}</th>
                        <th className="w-24 border-b border-slate-200 px-2 py-2 text-center">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-slate-100/70">
                        <td className="px-3 py-2 font-semibold text-slate-700" colSpan={17}>
                          Pre-project line item (if any)
                        </td>
                      </tr>
                      {depreciationSummaryRows.slice(0, 1).map((row, rowIndex) => (
                        <tr key={row.id || `depreciation-row-${rowIndex + 1}`} className="border-t border-slate-100">
                          <td className="px-2 py-2">
                            <input
                              className={`h-7 w-40 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                                isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                              }`}
                              value={row.phase}
                              onChange={(event) => updateDepreciationSummaryRowText(rowIndex, "phase", event.target.value)}
                              maxLength={200}
                              disabled={isReadOnlyView}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <select
                              className={`h-7 w-36 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                                isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                              }`}
                              value={row.category}
                              onChange={(event) => updateDepreciationSummaryRowText(rowIndex, "category", event.target.value)}
                              disabled={isReadOnlyView}
                            >
                              <option value="">Select Category</option>
                              {depreciationCategoryOptions.map((option) => (
                                <option key={`depreciation-category-pre-${option}`} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <select
                              className={`h-7 w-44 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                                isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                              }`}
                              value={row.capexPrepaidCategory}
                              onChange={(event) =>
                                updateDepreciationSummaryRowText(rowIndex, "capexPrepaidCategory", event.target.value)
                              }
                              disabled={isReadOnlyView || !row.category.trim()}
                            >
                              <option value="">
                                {row.category.trim() ? "Select Capex/Prepaid Category" : "Select Category first"}
                              </option>
                              {getCapexPrepaidOptionsForCategory(row.category, row.capexPrepaidCategory).map((option) => (
                                <option key={`depreciation-capex-pre-${row.id}-${option}`} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className={`h-7 w-32 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                                isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                              }`}
                              value={row.phaseStartDate}
                              onChange={(event) =>
                                updateDepreciationSummaryRowText(rowIndex, "phaseStartDate", event.target.value)
                              }
                              placeholder="YYYY-MM-DD"
                              disabled={isReadOnlyView}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className={`h-7 w-32 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                                isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                              }`}
                              value={row.phaseEndDate}
                              onChange={(event) =>
                                updateDepreciationSummaryRowText(rowIndex, "phaseEndDate", event.target.value)
                              }
                              placeholder="YYYY-MM-DD"
                              disabled={isReadOnlyView}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              className="h-7 w-24 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-right text-xs text-slate-600 outline-none"
                              value={row.usefulLifeYears}
                              disabled
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              className="h-7 w-28 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-right text-xs text-slate-600 outline-none"
                              value={row.totalProjectCost}
                              disabled
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              className={`h-7 w-28 rounded border border-slate-300 px-2 py-1 text-right text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                                isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                              }`}
                              value={row.projectCostForPhase}
                              onChange={(event) =>
                                updateDepreciationSummaryRowNumber(
                                  rowIndex,
                                  "projectCostForPhase",
                                  Number(event.target.value || 0)
                                )
                              }
                              disabled={isReadOnlyView}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              className="h-7 w-28 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-right text-xs text-slate-600 outline-none"
                              value={row.annualDepreciation}
                              disabled
                            />
                          </td>
                          {depreciationSummaryValueFields.map((field) => (
                            <td key={`${row.id}-${field}`} className="px-2 py-2">
                              <input
                                type="number"
                                className="h-7 w-24 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-right text-xs text-slate-600 outline-none"
                                value={row[field]}
                                disabled
                              />
                            </td>
                          ))}
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              className="h-7 w-24 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-right text-xs text-slate-600 outline-none"
                              value={row.total}
                              disabled
                            />
                          </td>
                        </tr>
                      ))}

                      <tr className="bg-slate-100/70">
                        <td className="px-3 py-2 font-semibold text-slate-700" colSpan={17}>
                          In-project line item breakdown by phase/date
                        </td>
                      </tr>
                      {depreciationSummaryRows.slice(1).map((row, rowIndex) => {
                        const absoluteIndex = rowIndex + 1;
                        return (
                          <tr
                            key={row.id || `depreciation-row-${absoluteIndex + 1}`}
                            className="border-t border-slate-100"
                          >
                            <td className="px-2 py-2">
                              <input
                                className={`h-7 w-40 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                                  isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                                }`}
                                value={row.phase}
                                onChange={(event) =>
                                  updateDepreciationSummaryRowText(absoluteIndex, "phase", event.target.value)
                                }
                                maxLength={200}
                                disabled={isReadOnlyView}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <select
                                className={`h-7 w-36 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                                  isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                                }`}
                                value={row.category}
                                onChange={(event) =>
                                  updateDepreciationSummaryRowText(absoluteIndex, "category", event.target.value)
                                }
                                disabled={isReadOnlyView}
                              >
                                <option value="">Select Category</option>
                                {depreciationCategoryOptions.map((option) => (
                                  <option key={`depreciation-category-${absoluteIndex}-${option}`} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-2">
                              <select
                                className={`h-7 w-44 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                                  isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                                }`}
                                value={row.capexPrepaidCategory}
                                onChange={(event) =>
                                  updateDepreciationSummaryRowText(
                                    absoluteIndex,
                                    "capexPrepaidCategory",
                                    event.target.value
                                  )
                                }
                                disabled={isReadOnlyView || !row.category.trim()}
                              >
                                <option value="">
                                  {row.category.trim() ? "Select Capex/Prepaid Category" : "Select Category first"}
                                </option>
                                {getCapexPrepaidOptionsForCategory(row.category, row.capexPrepaidCategory).map((option) => (
                                  <option key={`depreciation-capex-${absoluteIndex}-${option}`} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-2">
                              <input
                                className={`h-7 w-32 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                                  isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                                }`}
                                value={row.phaseStartDate}
                                onChange={(event) =>
                                  updateDepreciationSummaryRowText(absoluteIndex, "phaseStartDate", event.target.value)
                                }
                                placeholder="YYYY-MM-DD"
                                disabled={isReadOnlyView}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                className={`h-7 w-32 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                                  isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                                }`}
                                value={row.phaseEndDate}
                                onChange={(event) =>
                                  updateDepreciationSummaryRowText(absoluteIndex, "phaseEndDate", event.target.value)
                                }
                                placeholder="YYYY-MM-DD"
                                disabled={isReadOnlyView}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                className="h-7 w-24 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-right text-xs text-slate-600 outline-none"
                                value={row.usefulLifeYears}
                                disabled
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                className="h-7 w-28 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-right text-xs text-slate-600 outline-none"
                                value={row.totalProjectCost}
                                disabled
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                className={`h-7 w-28 rounded border border-slate-300 px-2 py-1 text-right text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                                  isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                                }`}
                                value={row.projectCostForPhase}
                                onChange={(event) =>
                                  updateDepreciationSummaryRowNumber(
                                    absoluteIndex,
                                    "projectCostForPhase",
                                    Number(event.target.value || 0)
                                  )
                                }
                                disabled={isReadOnlyView}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                className="h-7 w-28 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-right text-xs text-slate-600 outline-none"
                                value={row.annualDepreciation}
                                disabled
                              />
                            </td>
                            {depreciationSummaryValueFields.map((field) => (
                              <td key={`${row.id}-${field}`} className="px-2 py-2">
                                <input
                                  type="number"
                                  className="h-7 w-24 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-right text-xs text-slate-600 outline-none"
                                  value={row[field]}
                                  disabled
                                />
                              </td>
                            ))}
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                className="h-7 w-24 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-right text-xs text-slate-600 outline-none"
                                value={row.total}
                                disabled
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-4 border-t border-slate-200 px-4 py-4 md:grid-cols-[280px_280px_1fr]">
                  <label className="text-xs font-semibold text-slate-700">
                    Depreciation Prorating Date
                    <input
                      className={`mt-1 h-8 w-full rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                        isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                      }`}
                      value={form.businessCase.depreciationSummary.depreciationProratingGoLiveOrImplementationDate}
                      onChange={(event) =>
                        updateDepreciationSummarySetting(
                          "depreciationProratingGoLiveOrImplementationDate",
                          event.target.value
                        )
                      }
                      placeholder="YYYY-MM-DD"
                      disabled={isReadOnlyView}
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">
                    Periods Remaining in Last Year
                    <input
                      className={`mt-1 h-8 w-full rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                        isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                      }`}
                      value={form.businessCase.depreciationSummary.depreciationProratingPeriodsRemainingInLastYear}
                      onChange={(event) =>
                        updateDepreciationSummarySetting(
                          "depreciationProratingPeriodsRemainingInLastYear",
                          event.target.value
                        )
                      }
                      maxLength={120}
                      disabled={isReadOnlyView}
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">
                    Notes
                    <textarea
                      className={`mt-1 h-20 w-full rounded border border-slate-300 px-2 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                        isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                      }`}
                      value={form.businessCase.depreciationSummary.notes}
                      onChange={(event) => updateDepreciationSummarySetting("notes", event.target.value)}
                      maxLength={4000}
                      disabled={isReadOnlyView}
                    />
                  </label>
                </div>
              </article>

              <article className="order-5 w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-200">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h4 className="text-base font-semibold text-slate-900">Financial Summary</h4>
                </div>
                <div className="space-y-4 px-4 pb-4 pt-3">
                  <div className="table-scroll-x w-full max-w-full overflow-x-auto rounded-md border border-slate-200 overscroll-x-contain [scrollbar-gutter:stable]">
                    <table className="w-max min-w-[1700px] border-r border-slate-200 text-xs">
                      <thead>
                        <tr>
                          <th className="bg-brand-700 px-3 py-2 text-center font-semibold tracking-wide text-white" colSpan={15}>
                            Expenses
                          </th>
                        </tr>
                        <tr className="bg-slate-50 text-slate-700">
                          <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-center">Spend Type</th>
                          <th className="px-3 py-2 text-center">Project</th>
                          <th className="px-3 py-2 text-center">Prior FY(s)</th>
                          <th className="px-3 py-2 text-center">Q1</th>
                          <th className="px-3 py-2 text-center">Q2</th>
                          <th className="px-3 py-2 text-center">Q3</th>
                          <th className="px-3 py-2 text-center">Q4</th>
                          <th className="px-3 py-2 text-center">{`F${resourceCostYears[0]} Spend Total`}</th>
                          <th className="px-3 py-2 text-center">{`F${resourceCostYears[0]} Plan`}</th>
                          <th className="px-3 py-2 text-center">Over / Under Plan</th>
                          <th className="px-3 py-2 text-center">{`F${resourceCostYears[1]}`}</th>
                          <th className="px-3 py-2 text-center">{`F${resourceCostYears[2]}`}</th>
                          <th className="px-3 py-2 text-center">{`F${resourceCostYears[3]}`}</th>
                          <th className="px-3 py-2 text-center">{`F${resourceCostYears[4]}`}</th>
                          <th className="px-3 py-2 text-center">{`F${resourceCostYears[5]}`}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {financialSummaryExpensesRows.map((row) => (
                          <tr
                            key={row.id}
                            className={`border-t border-slate-100 ${row.total ? "bg-slate-100 font-semibold text-slate-900" : ""}`}
                          >
                            <td
                              className={`sticky left-0 z-10 px-3 py-2 ${
                                row.total ? "bg-slate-100" : "bg-white"
                              }`}
                            >
                              <span className={row.indent ? "pl-5" : ""}>{row.label}</span>
                            </td>
                            <td className="px-3 py-2 text-right">{number.format(row.values.project)}</td>
                            <td className="px-3 py-2 text-right">{number.format(row.values.priorFys)}</td>
                            <td className="px-3 py-2 text-right">{number.format(row.values.q1)}</td>
                            <td className="px-3 py-2 text-right">{number.format(row.values.q2)}</td>
                            <td className="px-3 py-2 text-right">{number.format(row.values.q3)}</td>
                            <td className="px-3 py-2 text-right">{number.format(row.values.q4)}</td>
                            <td className="px-3 py-2 text-right">{number.format(row.values.spendTotal)}</td>
                            <td className="px-3 py-2 text-right">{number.format(row.values.plan)}</td>
                            <td className="px-3 py-2 text-right">{number.format(row.values.overUnderPlan)}</td>
                            <td className="px-3 py-2 text-right">{number.format(row.values.f2026)}</td>
                            <td className="px-3 py-2 text-right">{number.format(row.values.f2027)}</td>
                            <td className="px-3 py-2 text-right">{number.format(row.values.f2028)}</td>
                            <td className="px-3 py-2 text-right">{number.format(row.values.f2029)}</td>
                            <td className="px-3 py-2 text-right">{number.format(row.values.f2030)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
                    <div className="table-scroll-x w-full max-w-full overflow-x-auto rounded-md border border-slate-200 overscroll-x-contain [scrollbar-gutter:stable]">
                      <table className="w-full min-w-[320px] border-r border-slate-200 text-xs">
                        <thead>
                          <tr>
                            <th
                              className="bg-brand-700 px-3 py-2 text-center font-semibold tracking-wide text-white"
                              colSpan={2}
                            >
                              Project Financial Metrics
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-700">5-Yr NPV</td>
                            <td className="px-3 py-2 text-right">{currency.format(financialMetrics.npv)}</td>
                          </tr>
                          <tr className="border-t border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-700">N-Yr NPV</td>
                            <td className="px-3 py-2 text-right">{currency.format(financialMetrics.npv)}</td>
                          </tr>
                          <tr className="border-t border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-700">5-Yr IRR</td>
                            <td className="px-3 py-2 text-right">
                              {financialMetrics.irrPct === null ? "N/A" : `${financialMetrics.irrPct.toFixed(2)}%`}
                            </td>
                          </tr>
                          <tr className="border-t border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-700">N-Yr IRR</td>
                            <td className="px-3 py-2 text-right">
                              {financialMetrics.irrPct === null ? "N/A" : `${financialMetrics.irrPct.toFixed(2)}%`}
                            </td>
                          </tr>
                          <tr className="border-t border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-700">Payback (yrs)</td>
                            <td className="px-3 py-2 text-right">{financialMetrics.paybackLabel}</td>
                          </tr>
                          <tr className="border-t border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-700">
                              Annual Ongoing Cost (excl. Depreciation)
                            </td>
                            <td className="px-3 py-2 text-right">
                              {number.format(Number(computedAnnualOngoingCost || 0))}
                            </td>
                          </tr>
                          <tr className="border-t border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-700">FTE Up/(Down)</td>
                            <td className="px-3 py-2">
                              <input
                                className={`h-7 w-full rounded border border-slate-300 px-2 py-1 text-right text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                                  isReadOnlyView ? "bg-slate-100 text-slate-600" : "bg-brand-100"
                                }`}
                                value={form.businessCase.introduction.fteUpDown}
                                onChange={(event) =>
                                  updateBusinessCaseField("introduction", "fteUpDown", event.target.value)
                                }
                                maxLength={120}
                                disabled={isReadOnlyView}
                              />
                            </td>
                          </tr>
                          <tr className="border-t border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-700">Current Year Spend ($ MM)</td>
                            <td className="px-3 py-2 text-right">
                              {number.format(financialSummaryExpenseTotals.currentYearSpend)}
                            </td>
                          </tr>
                          <tr className="border-t border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-700">Plan Spend ($ MM)</td>
                            <td className="px-3 py-2 text-right">{number.format(financialSummaryExpenseTotals.planSpend)}</td>
                          </tr>
                          <tr className="border-t border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-700">Total Cost ( Capex + One Time)</td>
                            <td className="px-3 py-2 text-right">
                              {number.format(Number(computedTotalCostCapexOneTime || 0))}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="table-scroll-x w-full max-w-full overflow-x-auto rounded-md border border-slate-200 overscroll-x-contain [scrollbar-gutter:stable]">
                      <table className="w-max min-w-[900px] border-r border-slate-200 text-xs">
                        <thead>
                          <tr>
                            <th className="bg-brand-700 px-3 py-2 text-center font-semibold tracking-wide text-white" colSpan={9}>
                              P&amp;L Impact
                            </th>
                          </tr>
                          <tr className="bg-slate-50 text-slate-700">
                            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-center">P&amp;L Items</th>
                            <th className="px-3 py-2 text-center">Total</th>
                            <th className="px-3 py-2 text-center">Prior FY(s)</th>
                            <th className="px-3 py-2 text-center">{`F${resourceCostYears[0]}`}</th>
                            <th className="px-3 py-2 text-center">{`F${resourceCostYears[1]}`}</th>
                            <th className="px-3 py-2 text-center">{`F${resourceCostYears[2]}`}</th>
                            <th className="px-3 py-2 text-center">{`F${resourceCostYears[3]}`}</th>
                            <th className="px-3 py-2 text-center">{`F${resourceCostYears[4]}`}</th>
                            <th className="px-3 py-2 text-center">{`F${resourceCostYears[5]}`}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {financialSummaryPLRows.map((row) => (
                            <tr
                              key={row.id}
                              className={`border-t border-slate-100 ${row.total ? "bg-slate-100 font-semibold text-slate-900" : ""}`}
                            >
                              <td
                                className={`sticky left-0 z-10 px-3 py-2 ${
                                  row.total ? "bg-slate-100" : "bg-white"
                                }`}
                              >
                                {row.label}
                              </td>
                              <td className="px-3 py-2 text-right">{number.format(row.values.total)}</td>
                              <td className="px-3 py-2 text-right">{number.format(row.values.priorFys)}</td>
                              <td className="px-3 py-2 text-right">{number.format(row.values.f2025)}</td>
                              <td className="px-3 py-2 text-right">{number.format(row.values.f2026)}</td>
                              <td className="px-3 py-2 text-right">{number.format(row.values.f2027)}</td>
                              <td className="px-3 py-2 text-right">{number.format(row.values.f2028)}</td>
                              <td className="px-3 py-2 text-right">{number.format(row.values.f2029)}</td>
                              <td className="px-3 py-2 text-right">{number.format(row.values.f2030)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="table-scroll-x w-full max-w-full overflow-x-auto rounded-md border border-slate-200 overscroll-x-contain [scrollbar-gutter:stable]">
                    <table className="w-max min-w-[900px] border-r border-slate-200 text-xs">
                      <thead>
                        <tr>
                          <th className="bg-brand-700 px-3 py-2 text-center font-semibold tracking-wide text-white" colSpan={9}>
                            Cash Flow Impact
                          </th>
                        </tr>
                        <tr className="bg-slate-50 text-slate-700">
                          <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-center">Cash Flow Impact</th>
                          <th className="px-3 py-2 text-center">Total</th>
                          <th className="px-3 py-2 text-center">Prior FY(s)</th>
                          <th className="px-3 py-2 text-center">{`F${resourceCostYears[0]}`}</th>
                          <th className="px-3 py-2 text-center">{`F${resourceCostYears[1]}`}</th>
                          <th className="px-3 py-2 text-center">{`F${resourceCostYears[2]}`}</th>
                          <th className="px-3 py-2 text-center">{`F${resourceCostYears[3]}`}</th>
                          <th className="px-3 py-2 text-center">{`F${resourceCostYears[4]}`}</th>
                          <th className="px-3 py-2 text-center">{`F${resourceCostYears[5]}`}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          {
                            id: "net-business-benefit",
                            label: "Net Business Benefit",
                            values: cashFlowDetails.netBusinessBenefit
                          },
                          {
                            id: "add-back-depreciation",
                            label: "Add back Depreciation",
                            values: cashFlowDetails.addBackDepreciation
                          },
                          {
                            id: "capital-prepaid-spending",
                            label: "Capital/Prepaid Spending",
                            values: cashFlowDetails.capitalPrepaidSpending
                          },
                          {
                            id: "internal-resource-costs",
                            label: "Internal Resource Costs",
                            values: cashFlowDetails.internalResourceCosts
                          },
                          {
                            id: "restructuring-hr-bau-funded",
                            label: "Restructuring (HR BAU Funded)",
                            values: cashFlowDetails.restructuringHrBauFunded,
                            editable: true,
                            note: "enter manually if applicable for projects"
                          },
                          {
                            id: "net-cash-flows",
                            label: "Net Cash Flows",
                            values: cashFlowDetails.netCashFlows,
                            total: true
                          }
                        ].map((row) => {
                          const rowIsEditable = Boolean(row.editable && !isReadOnlyView);
                          const valueInputClass =
                            "h-7 w-20 rounded border border-slate-300 px-2 py-1 text-right text-xs outline-none focus:ring-2 focus:ring-brand-200";
                          return (
                            <tr
                              key={row.id}
                              className={`border-t border-slate-100 ${
                                row.editable
                                  ? "bg-brand-100/60"
                                  : row.total
                                    ? "bg-slate-100 font-semibold text-slate-900"
                                    : ""
                              }`}
                            >
                              <td
                                className={`sticky left-0 z-10 px-3 py-2 ${
                                  row.editable ? "bg-brand-100/60" : row.total ? "bg-slate-100" : "bg-white"
                                }`}
                              >
                                <div className="flex flex-col">
                                  <span>{row.label}</span>
                                  {row.note ? <span className="text-[11px] text-slate-500">{row.note}</span> : null}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">{number.format(row.values.total)}</td>
                              {financialSummaryValueFields.map((field) => (
                                <td key={`${row.id}-${field}`} className="px-3 py-2 text-right">
                                  {row.editable ? (
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      inputMode="decimal"
                                      className={`${valueInputClass} ${
                                        rowIsEditable ? "bg-brand-100" : "bg-slate-100 text-slate-600"
                                      }`}
                                      value={row.values[field]}
                                      onChange={(event) =>
                                        updateFinancialSummaryRestructuringValue(
                                          field,
                                          Number(event.target.value || 0)
                                        )
                                      }
                                      disabled={!rowIsEditable}
                                    />
                                  ) : (
                                    number.format(row.values[field])
                                  )}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </article>

              <article className="order-2 w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-200">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h4 className="text-base font-semibold text-slate-900">One Time Costs</h4>
                </div>
                <div className="table-scroll-x w-full max-w-full overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
                  <table className="w-max min-w-[1700px] border-r border-slate-200 text-xs">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2 text-center">
                          One Time Cost Item
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center">Comments</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center">Project Total</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center">Prior FY(s)</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center">{`F${resourceCostYears[0]} Spend`}</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center">{`F${resourceCostYears[0]} Plan`}</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center">{`F${resourceCostYears[1]}`}</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center">{`F${resourceCostYears[2]}`}</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center">{`F${resourceCostYears[3]}`}</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center">{`F${resourceCostYears[4]}`}</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center">{`F${resourceCostYears[5]}`}</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {oneTimeCostRows.map((row, index) => {
                        const isTotalRow = row.id === "ot-total";
                        const canEdit = !isReadOnlyView && !isTotalRow;
                        const inputBaseClass =
                          "h-7 rounded border border-slate-300 px-2 py-1 text-right text-xs outline-none focus:ring-2 focus:ring-brand-200";
                        const editableClass = "bg-brand-100";
                        const readonlyClass = "bg-slate-100 text-slate-600";
                        return (
                          <tr
                            key={row.id || `ot-${index + 1}`}
                            className={`border-t border-slate-100 ${isTotalRow ? "bg-slate-100 font-semibold text-slate-900" : ""}`}
                          >
                            <td className="sticky left-0 z-10 bg-white px-3 py-2">{row.item}</td>
                            <td className="px-2 py-2">
                              <input
                                className={`h-7 w-64 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-200 ${
                                  canEdit ? editableClass : readonlyClass
                                }`}
                                value={row.comments}
                                onChange={(event) => updateOneTimeCostRowText(index, "comments", event.target.value)}
                                disabled={!canEdit}
                                maxLength={1000}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                className={`${inputBaseClass} w-28 ${canEdit ? editableClass : readonlyClass}`}
                                value={row.projectTotal}
                                onChange={(event) =>
                                  updateOneTimeCostRowNumber(index, "projectTotal", Number(event.target.value || 0))
                                }
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                className={`${inputBaseClass} w-24 ${canEdit ? editableClass : readonlyClass}`}
                                value={row.priorFys}
                                onChange={(event) =>
                                  updateOneTimeCostRowNumber(index, "priorFys", Number(event.target.value || 0))
                                }
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                className={`${inputBaseClass} w-28 ${canEdit ? editableClass : readonlyClass}`}
                                value={row.currentYearSpend}
                                onChange={(event) =>
                                  updateOneTimeCostRowNumber(index, "currentYearSpend", Number(event.target.value || 0))
                                }
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                className={`${inputBaseClass} w-28 ${canEdit ? editableClass : readonlyClass}`}
                                value={row.currentYearPlan}
                                onChange={(event) =>
                                  updateOneTimeCostRowNumber(index, "currentYearPlan", Number(event.target.value || 0))
                                }
                                disabled={!canEdit}
                              />
                            </td>
                            {(["yearPlus1", "yearPlus2", "yearPlus3", "yearPlus4", "yearPlus5"] as const).map((field) => (
                              <td key={`${row.id}-${field}`} className="px-2 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  inputMode="decimal"
                                  className={`${inputBaseClass} w-24 ${canEdit ? editableClass : readonlyClass}`}
                                  value={row[field]}
                                  onChange={(event) =>
                                    updateOneTimeCostRowNumber(index, field, Number(event.target.value || 0))
                                  }
                                  disabled={!canEdit}
                                />
                              </td>
                            ))}
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                className={`${inputBaseClass} w-24 ${readonlyClass}`}
                                value={row.total}
                                disabled
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="order-1 w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-200">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h4 className="text-base font-semibold text-slate-900">P &amp; L Impact</h4>
                  <p className="text-xs text-slate-500">
                    Highlighted cells are user inputs. Totals are auto-calculated.
                  </p>
                </div>
                <div className="table-scroll-x w-full max-w-full overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
                  <table className="w-max min-w-[1400px] border-r border-slate-200 text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-700">
                        <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-center">P&amp;L Items</th>
                        <th className="px-3 py-2 text-center">Total</th>
                        <th className="px-3 py-2 text-center">Prior FY(s)</th>
                        <th className="px-3 py-2 text-center">{`F${resourceCostYears[0]}`}</th>
                        <th className="px-3 py-2 text-center">{`F${resourceCostYears[1]}`}</th>
                        <th className="px-3 py-2 text-center">{`F${resourceCostYears[2]}`}</th>
                        <th className="px-3 py-2 text-center">{`F${resourceCostYears[3]}`}</th>
                        <th className="px-3 py-2 text-center">{`F${resourceCostYears[4]}`}</th>
                        <th className="px-3 py-2 text-center">{`F${resourceCostYears[5]}`}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pAndLImpactRows.flatMap((row, index) => {
                        const showGroupHeader =
                          index === 0 || pAndLImpactRows[index - 1].group !== row.group;
                        const isAutoCalculated = row.isTotal || row.id === "pl-project-expense-spend";
                        const canEdit = !isReadOnlyView && !isAutoCalculated;
                        const inputBaseClass =
                          "h-7 rounded border border-slate-300 px-2 py-1 text-right text-xs outline-none focus:ring-2 focus:ring-brand-200";
                        const editableClass = "bg-brand-100";
                        const readonlyClass = "bg-slate-100 text-slate-600";

                        const renderedRows = [];
                        if (showGroupHeader) {
                          renderedRows.push(
                            <tr key={`${row.id}-group`} className="bg-slate-100/70">
                              <td className="px-3 py-2 font-semibold text-slate-700" colSpan={9}>
                                {row.group}
                              </td>
                            </tr>
                          );
                        }

                        renderedRows.push(
                          <tr
                            key={row.id}
                            className={`border-t border-slate-100 ${row.isTotal ? "font-semibold text-slate-900" : ""}`}
                          >
                            <td className="sticky left-0 z-10 bg-white px-3 py-2">{row.label}</td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                className={`${inputBaseClass} w-24 ${readonlyClass}`}
                                value={row.total}
                                disabled
                              />
                            </td>
                            {pAndLImpactValueFields.map((field) => (
                              <td key={`${row.id}-${field}`} className="px-2 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  inputMode="decimal"
                                  className={`${inputBaseClass} w-24 ${canEdit ? editableClass : readonlyClass}`}
                                  value={row[field]}
                                  onChange={(event) =>
                                    updatePLImpactRowNumber(index, field, Number(event.target.value || 0))
                                  }
                                  disabled={!canEdit}
                                />
                              </td>
                            ))}
                          </tr>
                        );

                        return renderedRows;
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          ) : null}

          {activeSection === "D. Financials" && isBusinessCaseMode ? (
            <div className="min-w-0 w-full space-y-6">
              <div className="grid gap-6 xl:grid-cols-2">
              <article className="rounded-lg border border-slate-200 p-4">
                <h4 className="text-base font-semibold text-slate-900">Benefit Realization Plan</h4>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <label className="text-sm">
                    Benefit Description
                    <textarea
                      className="mt-1 h-20 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.benefitRealizationPlan.benefitDescription}
                      onChange={(event) =>
                        updateBusinessCaseField("benefitRealizationPlan", "benefitDescription", event.target.value)
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Assumptions
                    <textarea
                      className="mt-1 h-20 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.benefitRealizationPlan.assumptions}
                      onChange={(event) =>
                        updateBusinessCaseField("benefitRealizationPlan", "assumptions", event.target.value)
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Dependencies
                    <textarea
                      className="mt-1 h-20 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.benefitRealizationPlan.dependencies}
                      onChange={(event) =>
                        updateBusinessCaseField("benefitRealizationPlan", "dependencies", event.target.value)
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Deliverable #1
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.benefitRealizationPlan.deliverable1}
                      onChange={(event) =>
                        updateBusinessCaseField("benefitRealizationPlan", "deliverable1", event.target.value)
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Deliverable #2
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.benefitRealizationPlan.deliverable2}
                      onChange={(event) =>
                        updateBusinessCaseField("benefitRealizationPlan", "deliverable2", event.target.value)
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Deliverable #3
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.benefitRealizationPlan.deliverable3}
                      onChange={(event) =>
                        updateBusinessCaseField("benefitRealizationPlan", "deliverable3", event.target.value)
                      }
                    />
                  </label>
                  <label className="text-sm md:col-span-2">
                    Non-Financial Benefits Summary
                    <textarea
                      className="mt-1 h-20 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.benefitRealizationPlan.nonFinancialBenefitsSummary}
                      onChange={(event) =>
                        updateBusinessCaseField(
                          "benefitRealizationPlan",
                          "nonFinancialBenefitsSummary",
                          event.target.value
                        )
                      }
                    />
                  </label>
                  <label className="text-sm md:col-span-2">
                    Additional post-project deliverables to achieve 100% of benefits
                    <textarea
                      className="mt-1 h-20 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.benefitRealizationPlan.additionalPostProjectDeliverables}
                      onChange={(event) =>
                        updateBusinessCaseField(
                          "benefitRealizationPlan",
                          "additionalPostProjectDeliverables",
                          event.target.value
                        )
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Segment / Department Tracking the Benefit
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.benefitRealizationPlan.segmentDepartmentTrackingBenefit}
                      onChange={(event) =>
                        updateBusinessCaseField(
                          "benefitRealizationPlan",
                          "segmentDepartmentTrackingBenefit",
                          event.target.value
                        )
                      }
                    >
                      <option value="">Select Segment - Unit</option>
                      {selectOptions.segments.map((option) => (
                        <option key={`benefit-segment-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Other Enterprise Benefits
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                      value={form.businessCase.benefitRealizationPlan.otherEnterpriseBenefits}
                      onChange={(event) =>
                        updateBusinessCaseField("benefitRealizationPlan", "otherEnterpriseBenefits", event.target.value)
                      }
                    />
                  </label>
                </div>
              </article>
              <article className="rounded-lg border border-slate-200 p-4">
                <h4 className="text-base font-semibold text-slate-900">Opportunity Summary</h4>
                <div className="mt-3 grid gap-3">
                  {form.businessCase.opportunitySummary.map((value, index) => (
                    <label key={`opportunity-${index}`} className="text-sm">
                      Row {index + 1}
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                        value={value}
                        onChange={(event) => updateBusinessCaseOpportunity(index, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </article>
              </div>

              <article className="rounded-lg border border-slate-200 p-4">
                <h4 className="text-base font-semibold text-slate-900">Metrics and KPIs</h4>
                <div className="table-scroll-x mt-3 w-full max-w-full overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-center">#</th>
                        <th className="px-3 py-2 text-center">Key Metric Category</th>
                        <th className="px-3 py-2 text-center">Key Metric</th>
                        <th className="px-3 py-2 text-center">Target Value</th>
                        <th className="px-3 py-2 text-center">Prior FY(s)</th>
                        <th className="px-3 py-2 text-center">F{resourceCostYears[1]}</th>
                        <th className="px-3 py-2 text-center">F{resourceCostYears[2]}</th>
                        <th className="px-3 py-2 text-center">F{resourceCostYears[3]}</th>
                        <th className="px-3 py-2 text-center">F{resourceCostYears[4]}</th>
                        <th className="px-3 py-2 text-center">F{resourceCostYears[5]}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.businessCase.metricsAndKpis.map((row, index) => (
                        <tr key={`metric-${index}`} className="border-t border-slate-100">
                          <td className="px-3 py-2">{index + 1}</td>
                          <td className="px-2 py-2">
                            <select
                              className="w-full rounded border border-slate-300 px-2 py-1"
                              value={row.keyMetricCategory}
                              onChange={(event) => {
                                const category = event.target.value;
                                const categoryMetrics = businessCaseConfig.kpiMetricMap[category] ?? [];
                                const nextMetric = categoryMetrics.includes(row.keyMetric) ? row.keyMetric : "";
                                if (isReadOnlyView) return;
                                setDirty(true);
                                setForm((prev) => {
                                  const metricsRows = [...prev.businessCase.metricsAndKpis];
                                  const currentRow = {
                                    ...defaultBusinessCaseMetric(),
                                    ...(metricsRows[index] ?? {})
                                  };
                                  metricsRows[index] = {
                                    ...currentRow,
                                    keyMetricCategory: category,
                                    keyMetric: nextMetric
                                  };
                                  return {
                                    ...prev,
                                    businessCase: {
                                      ...prev.businessCase,
                                      metricsAndKpis: metricsRows
                                    }
                                  };
                                });
                              }}
                              disabled={isReadOnlyView}
                            >
                              <option value="">Select category</option>
                              {kpiCategories.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <select
                              className="w-full rounded border border-slate-300 px-2 py-1"
                              value={row.keyMetric}
                              onChange={(event) => updateBusinessCaseMetric(index, "keyMetric", event.target.value)}
                              disabled={isReadOnlyView || !row.keyMetricCategory}
                            >
                              <option value="">Select metric</option>
                              {(businessCaseConfig.kpiMetricMap[row.keyMetricCategory] ?? []).map((metric) => (
                                <option key={metric} value={metric}>
                                  {metric}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-full rounded border border-slate-300 px-2 py-1"
                              value={row.targetValue}
                              onChange={(event) => updateBusinessCaseMetric(index, "targetValue", event.target.value)}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-full rounded border border-slate-300 px-2 py-1"
                              value={row.priorFys}
                              onChange={(event) => updateBusinessCaseMetric(index, "priorFys", event.target.value)}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-full rounded border border-slate-300 px-2 py-1"
                              value={row.f2026}
                              onChange={(event) => updateBusinessCaseMetric(index, "f2026", event.target.value)}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-full rounded border border-slate-300 px-2 py-1"
                              value={row.f2027}
                              onChange={(event) => updateBusinessCaseMetric(index, "f2027", event.target.value)}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-full rounded border border-slate-300 px-2 py-1"
                              value={row.f2028}
                              onChange={(event) => updateBusinessCaseMetric(index, "f2028", event.target.value)}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-full rounded border border-slate-300 px-2 py-1"
                              value={row.f2029}
                              onChange={(event) => updateBusinessCaseMetric(index, "f2029", event.target.value)}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-full rounded border border-slate-300 px-2 py-1"
                              value={row.f2030}
                              onChange={(event) => updateBusinessCaseMetric(index, "f2030", event.target.value)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          ) : null}

          {activeSection === "A. Overview" && !isBusinessCaseMode ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm md:col-span-2">
                Project Name
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.title}
                  onChange={(event) => update("title", event.target.value)}
                  placeholder="Enter official project name"
                  required
                />
              </label>
              <label className="text-sm md:col-span-2">
                Project Description
                <textarea
                  className="mt-1 h-32 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.summary}
                  onChange={(event) => update("summary", event.target.value)}
                  placeholder="Brief project description (max 530 characters)"
                  maxLength={530}
                  required
                />
              </label>
              <label className="text-sm md:col-span-2">
                Financial Benefits and Assumptions
                <textarea
                  className="mt-1 h-28 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.benefits.financialAssumptions}
                  onChange={(event) => updateBenefits("financialAssumptions", event.target.value)}
                  placeholder="Revenue and cost assumptions..."
                />
              </label>
              <label className="text-sm md:col-span-2">
                Intangible Benefits and Assumptions
                <textarea
                  className="mt-1 h-28 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.benefits.intangibleAssumptions}
                  onChange={(event) => updateBenefits("intangibleAssumptions", event.target.value)}
                  placeholder="Risk, compliance, client or employee outcomes..."
                />
              </label>
            </div>
          ) : null}

          {activeSection === "B. Sponsor & Timeline" && !isBusinessCaseMode ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                Executive Sponsor
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.executiveSponsor}
                  onChange={(event) => update("executiveSponsor", event.target.value)}
                >
                  <option value="">Select sponsor</option>
                  {personSelectorOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Business Sponsor
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.businessSponsor}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDirty(true);
                    setForm((prev) => ({
                      ...prev,
                      businessSponsor: value,
                      sponsorName: value,
                      sponsorEmail: resolvePersonEmail(value, prev.sponsorEmail),
                      businessCase: {
                        ...prev.businessCase,
                        introduction: {
                          ...prev.businessCase.introduction,
                          businessSponsor: value
                        }
                      }
                    }));
                  }}
                >
                  <option value="">Select name</option>
                  {personSelectorOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Start Date
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.startDate}
                  onChange={(event) => {
                    const nextStartDate = event.target.value;
                    setDirty(true);
                    setForm((prev) => ({
                      ...prev,
                      startDate: nextStartDate,
                      endDate:
                        prev.endDate && isEndBeforeStart(nextStartDate, prev.endDate)
                          ? nextStartDate
                          : prev.endDate
                    }));
                    setDateError(null);
                  }}
                />
              </label>
              <label className="text-sm">
                Closure Date
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={(event) => {
                    const nextEndDate = event.target.value;
                    if (isEndBeforeStart(form.startDate, nextEndDate)) {
                      setDateError(DATE_ORDER_ERROR_MESSAGE);
                      return;
                    }

                    setDateError(null);
                    update("endDate", nextEndDate);
                  }}
                />
              </label>
              {dateError ? <p className="text-sm text-red-700 md:col-span-2">{dateError}</p> : null}
              <label className="text-sm">
                Segment - Unit
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.segmentUnit}
                  onChange={(event) => update("segmentUnit", event.target.value)}
                >
                  <option value="">Select Segment - Unit</option>
                  {selectOptions.segments.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {activeSection === "C. Characteristics" && !isBusinessCaseMode ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                Project Theme
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.projectTheme}
                  onChange={(event) => update("projectTheme", event.target.value)}
                >
                  <option value="">Select Project Theme</option>
                  {selectOptions.projectThemes.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Strategic Objective
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.strategicObjective}
                  onChange={(event) => update("strategicObjective", event.target.value)}
                >
                  <option value="">Select Strategic Objective</option>
                  {selectOptions.strategicObjectives.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Project Category
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.category}
                  onChange={(event) => update("category", event.target.value)}
                  required
                >
                  <option value="">Select Project Category</option>
                  {selectOptions.projectCategories.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Specific Project Classification Type
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.specificClassificationType}
                  onChange={(event) => {
                    const value = event.target.value;
                    const projectClassification = deriveProjectClassification(value);
                    setDirty(true);
                    setForm((prev) => ({
                      ...prev,
                      specificClassificationType: value,
                      projectClassification,
                      projectType: deriveProjectType(projectClassification)
                    }));
                  }}
                >
                  <option value="">Select classification type</option>
                  {selectOptions.classificationTypes.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Project Classification
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-slate-700"
                  value={form.projectClassification}
                  readOnly
                />
              </label>
              <label className="text-sm">
                Project Type
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-slate-700"
                  value={form.projectType}
                  readOnly
                />
              </label>
              <label className="text-sm">
                CIBC Enterprise Project Theme
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.enterpriseProjectTheme}
                  onChange={(event) => update("enterpriseProjectTheme", event.target.value)}
                >
                  <option value="">Select enterprise theme</option>
                  {selectOptions.enterpriseThemes.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Portfolio ESC
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.portfolioEsc}
                  onChange={(event) => update("portfolioEsc", event.target.value)}
                >
                  <option value="">Select Portfolio ESC</option>
                  {selectOptions.portfolioEscs.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Funding Source
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.businessCase.introduction.fundingSource}
                  onChange={(event) => updateBusinessCaseField("introduction", "fundingSource", event.target.value)}
                >
                  <option value="">Select Funding Source</option>
                  {selectOptions.fundingSources.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Funding Type
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.businessCase.introduction.fundingType}
                  onChange={(event) => updateBusinessCaseField("introduction", "fundingType", event.target.value)}
                >
                  <option value="">Select Funding Type</option>
                  {selectOptions.fundingTypes.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600 md:col-span-2">
                Attachments: coming next in file-upload milestone.
              </div>
            </div>
          ) : null}

          {activeSection === "D. Financials" && !isBusinessCaseMode ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-sm">
                  Select project commencement fiscal
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                    value={form.financialGrid.commencementFiscalYear}
                    onChange={(event) => setCommencementFiscalYear(Number(event.target.value))}
                  >
                    {commencementFiscalYearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <article className="overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Total Investment (US &#39;000s)</th>
                        <th className="px-3 py-2">Prior Yrs</th>
                        <th className="px-3 py-2">F{form.financialGrid.commencementFiscalYear}</th>
                        <th className="px-3 py-2">Future</th>
                        <th className="px-3 py-2">Life</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-slate-100 bg-slate-50 font-semibold">
                        <td className="px-3 py-2">Capital</td>
                        <td className="px-3 py-2 text-center">{number.format(capitalTotals.priorYears)}</td>
                        <td className="px-3 py-2 text-center">{number.format(capitalTotals.currentFiscal)}</td>
                        <td className="px-3 py-2 text-center">{number.format(capitalTotals.future)}</td>
                        <td className="px-3 py-2 text-center">
                          {number.format(capitalTotals.priorYears + capitalTotals.currentFiscal + capitalTotals.future)}
                        </td>
                      </tr>
                      {investmentRows.map((row) => (
                        <tr
                          key={row.key}
                          className={`border-t border-slate-100 ${row.key === "expenses" ? "font-semibold" : ""}`}
                        >
                          <td className="px-3 py-2">{row.label}</td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              className="mx-auto block w-24 rounded border border-slate-300 px-2 py-1 text-center"
                              value={form.financialGrid.investment[row.key].priorYears}
                              onChange={(event) =>
                                updateInvestmentCell(row.key, "priorYears", Number(event.target.value || 0))
                              }
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              className="mx-auto block w-24 rounded border border-slate-300 px-2 py-1 text-center"
                              value={form.financialGrid.investment[row.key].currentFiscal}
                              onChange={(event) =>
                                updateInvestmentCell(row.key, "currentFiscal", Number(event.target.value || 0))
                              }
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              className="mx-auto block w-24 rounded border border-slate-300 px-2 py-1 text-center"
                              value={form.financialGrid.investment[row.key].future}
                              onChange={(event) => updateInvestmentCell(row.key, "future", Number(event.target.value || 0))}
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            {number.format(
                              form.financialGrid.investment[row.key].priorYears +
                                form.financialGrid.investment[row.key].currentFiscal +
                                form.financialGrid.investment[row.key].future
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-slate-200 bg-slate-100 font-semibold">
                        <td className="px-3 py-2">Total Investment</td>
                        <td className="px-3 py-2 text-center">{number.format(totalInvestmentRow.priorYears)}</td>
                        <td className="px-3 py-2 text-center">{number.format(totalInvestmentRow.currentFiscal)}</td>
                        <td className="px-3 py-2 text-center">{number.format(totalInvestmentRow.future)}</td>
                        <td className="px-3 py-2 text-center">
                          {number.format(
                            totalInvestmentRow.priorYears +
                              totalInvestmentRow.currentFiscal +
                              totalInvestmentRow.future
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </article>

                <article className="overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Incremental Revenue & Cost (US &#39;000s)</th>
                        {form.financialGrid.incremental.years.map((year) => (
                          <th key={year} className="px-3 py-2">
                            F{year}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {incrementalRows.map((row) => (
                        <tr key={row.key} className="border-t border-slate-100">
                          <td className="px-3 py-2">{row.label}</td>
                          {form.financialGrid.incremental[row.key].map((value, index) => (
                            <td key={`${row.key}-${index}`} className="px-2 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                className="mx-auto block w-20 rounded border border-slate-300 px-2 py-1 text-center"
                                value={value}
                                onChange={(event) =>
                                  updateIncremental(row.key, index, Number(event.target.value || 0))
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="border-t border-slate-100">
                        <td className="px-3 py-2">Depreciation of Capital</td>
                        {depreciationOfCapitalByYear.map((value, index) => (
                          <td key={`depreciation-${index}`} className="px-3 py-2 text-center">
                            {number.format(value)}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                        <td className="px-3 py-2">Net Benefits</td>
                        {netBenefitsByYear.map((value, index) => (
                          <td key={`net-benefits-${index}`} className="px-3 py-2 text-center">
                            {number.format(value)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </article>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-sm">
                  Payback (Yrs)
                  <input
                    readOnly
                    className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-slate-700"
                    value={financialMetrics.paybackLabel}
                  />
                </label>
                <label className="text-sm">
                  NPV (14% Discount)
                  <input
                    readOnly
                    className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-slate-700"
                    value={currency.format(financialMetrics.npv)}
                  />
                </label>
                <label className="text-sm">
                  IRR (%)
                  <input
                    readOnly
                    className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-slate-700"
                    value={financialMetrics.irrPct === null ? "N/A" : `${financialMetrics.irrPct.toFixed(2)}%`}
                  />
                </label>
              </div>

              <div className="grid gap-3 rounded-md bg-slate-50 p-4 text-sm md:grid-cols-6">
                <p>
                  <span className="text-slate-500">Total Investment:</span>{" "}
                  <span className="font-semibold">{currency.format(totalInvestment)}</span>
                </p>
                <p>
                  <span className="text-slate-500">Incremental Revenue:</span>{" "}
                  <span className="font-semibold">{currency.format(totalIncrementalRevenue)}</span>
                </p>
                <p>
                  <span className="text-slate-500">Saved Costs:</span>{" "}
                  <span className="font-semibold">{currency.format(totalSavedCosts)}</span>
                </p>
                <p>
                  <span className="text-slate-500">Additional Operating Costs:</span>{" "}
                  <span className="font-semibold">{currency.format(totalAddlCosts)}</span>
                </p>
                <p>
                  <span className="text-slate-500">Payback (Yrs):</span>{" "}
                  <span className="font-semibold">{financialMetrics.paybackLabel}</span>
                </p>
                <p>
                  <span className="text-slate-500">IRR:</span>{" "}
                  <span className="font-semibold">
                    {financialMetrics.irrPct === null ? "N/A" : `${financialMetrics.irrPct.toFixed(2)}%`}
                  </span>
                </p>
              </div>
            </div>
          ) : null}
          </fieldset>
        </div>
      </section>

      {submissionId ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold">Workflow Actions</h3>
            <p className="mt-1 text-sm text-slate-600">
              Approval decisions are handled in the dedicated Approvals section. Intake forms remain view/edit only.
            </p>
            {workflowState ? (
              <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-6">
                <p>
                  Stage: <span className="font-semibold">{currentStage}</span>
                </p>
                <p>
                  Status: <span className="font-semibold">{currentStatus}</span>
                </p>
                <p>
                  Sponsor: <span className="font-semibold">{workflowState.sponsorDecision}</span>
                </p>
                <p>
                  PGO: <span className="font-semibold">{workflowState.pgoDecision}</span>
                </p>
                <p>
                  Finance: <span className="font-semibold">{workflowState.financeDecision}</span>
                </p>
                <p>
                  SPO: <span className="font-semibold">{workflowState.spoDecision}</span>
                </p>
                <p>
                  Funding: <span className="font-semibold">{workflowState.fundingStatus}</span>
                </p>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {allowedActions.length > 0 ? (
                allowedActions.map((action) => (
                  <span key={action} className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
                    {action.replaceAll("_", " ")}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">No applicable actions right now.</span>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold">Governance & Audit Trail</h3>
            <p className="mt-1 text-sm text-slate-600">
              Read-only timeline of submission, workflow, and governance actions.
            </p>
            <div className="mt-4 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Timestamp</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                    <th className="px-3 py-2 font-semibold">Stage</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Actor</th>
                    <th className="px-3 py-2 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedAuditTrail.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-slate-500" colSpan={6}>
                        No audit events captured yet.
                      </td>
                    </tr>
                  ) : (
                    orderedAuditTrail.map((event) => (
                      <tr key={event.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-xs text-slate-600">{formatAuditDateTime(event.createdAt)}</td>
                        <td className="px-3 py-2">{event.action}</td>
                        <td className="px-3 py-2">{event.stage}</td>
                        <td className="px-3 py-2">{event.status}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {event.actorName || "System"}
                          {event.actorEmail ? ` (${event.actorEmail})` : ""}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">{event.note || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {success ? <p className="text-sm text-green-700">{success}</p> : null}

      {showUnsavedWarning ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="bg-brand-50 px-5 py-3.5">
              <h3 className="text-lg font-semibold text-brand-800">Warning</h3>
            </div>
            <div className="border-t border-slate-200 px-5 py-4">
              <p className="text-sm text-slate-700">Are you sure you want to leave without saving? Unsaved changes will be lost.</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={cancelLeaveWithoutSaving}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLeaveWithoutSaving}
                className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
