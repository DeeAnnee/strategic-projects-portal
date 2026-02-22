import { promises as fs } from "node:fs";
import path from "node:path";

import {
  cancelPendingApprovalRequestsForSubmission,
  createApprovalRequestsForSubmission,
  getApprovalRequestSummaryForSubmission,
  getRequiredApprovalRoleContextsForSubmission
} from "@/lib/approvals/requests-store";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";
import { notifyApprovalRequestCreated, notifyWorkflowEvent } from "@/lib/notifications/provider";
import { resolveSponsorEmail, resolveSponsorName } from "@/lib/submissions/sponsor-contact";
import type {
  ApprovalStageCode,
  ApprovalStageStatus,
  BusinessCaseData,
  CreateSubmissionInput,
  DeepPartial,
  FinancialGrid,
  ProjectApprovalStageRecord,
  ProjectAssignment,
  ProjectPersonRef,
  ProjectStage,
  ProjectStatus,
  ProjectSubmission,
  SponsorContacts,
  SubmissionAuditEntry,
  SubmissionPatch,
  WorkflowAction,
  WorkflowEntityType,
  WorkflowLifecycleStatus
} from "@/lib/submissions/types";
import {
  getAllowedWorkflowActions,
  isWorkflowEditableStatus,
  mapLifecycleToStageStatus,
  resolveWorkflowLifecycleStatus
} from "@/lib/submissions/workflow";
import type { WorkCard, WorkTask } from "@/lib/operations/types";
import { cloneJson, safePersistJson } from "@/lib/storage/json-file";

const storeFile = path.join(process.cwd(), "data", "submissions.json");
const operationsBoardFile = path.join(process.cwd(), "data", "operations-board.json");
const projectManagementTaskFile = path.join(process.cwd(), "data", "project-management-tasks.json");
let inMemorySubmissions: ProjectSubmission[] | null = null;
let inMemoryOperationsBoard: WorkCard[] | null = null;
let inMemoryProjectManagementTasks:
  | Array<{
      id: string;
      projectId: string;
      fundingRequestId: string;
      taskType: "ASSIGN_PROJECT_MANAGER";
      status: "OPEN" | "CLOSED";
      createdAt: string;
      updatedAt: string;
    }>
  | null = null;

const LEGACY_STAGE_MAP: Record<string, ProjectStage> = {
  Intake: "PROPOSAL",
  Funding: "FUNDING",
  Resourcing: "FUNDING",
  Financials: "FUNDING",
  Approval: "PROPOSAL",
  Delivery: "LIVE",
  "Benefits Tracking": "LIVE",
  Closed: "LIVE",
  "Request Funding": "FUNDING",
  "Change Request (if required)": "LIVE",
  "PGO & Finance Review": "PROPOSAL",
  "SPO Committee Review": "PROPOSAL",
  "Placemat Proposal": "PROPOSAL",
  "Sponsor Approval": "PROPOSAL",
  "Funding Request": "FUNDING",
  "Live Project": "LIVE",
  "Change Request": "LIVE"
};

const LEGACY_STATUS_MAP: Record<string, ProjectStatus> = {
  Draft: "DRAFT",
  Submitted: "PGO_FGO_REVIEW",
  "Under Review": "SPONSOR_REVIEW",
  "Sent for Approval": "SPONSOR_REVIEW",
  "At SPO Review": "SPO_REVIEW",
  Approved: "APPROVED",
  Rejected: "REJECTED",
  "Returned to Submitter": "DRAFT",
  "On Hold": "CHANGE_REVIEW",
  "In Execution": "ACTIVE",
  Completed: "ACTIVE",
  Deferred: "CHANGE_REVIEW",
  Cancelled: "CHANGE_REVIEW",
  SPONSOR_REVIEW: "SPONSOR_REVIEW",
  PGO_FGO_REVIEW: "PGO_FGO_REVIEW",
  SPO_REVIEW: "SPO_REVIEW",
  ACTIVE: "ACTIVE"
};

const LEGACY_CATEGORY_MAP: Record<string, ProjectSubmission["category"]> = {
  Strategic: "Technology",
  Structural: "Premise",
  Tactical: "Other",
  Technology: "Technology",
  Premise: "Premise",
  Other: "Other"
};

const toCaseId = (id: string) => {
  const year = new Date().getFullYear();
  if (id.startsWith("SP-")) {
    return id;
  }

  const maybeNumber = Number.parseInt(id.split("-").pop() ?? "", 10);
  const seq = Number.isFinite(maybeNumber) ? maybeNumber : 1;
  return `SP-${year}-${String(seq).padStart(3, "0")}`;
};

const deriveProjectClassification = (value?: string) =>
  value?.toUpperCase().slice(0, 4) ?? "";

const deriveProjectType = (classification?: string) => {
  const code = (classification ?? "").toUpperCase();
  if (!code) return "";

  if (code === "GRO " || code === "PRO " || code === "DISC" || code === "TRAN") return "Grow";
  if (code === "PS&E" || code === "RG 1" || code === "RG 2" || code === "RG 3" || code === "MOP " || code === "EVER") return "Run";

  return "";
};

const deriveWorkflowEntityType = (stage: ProjectStage, fundingStatus?: string): WorkflowEntityType => {
  if (stage === "FUNDING" || stage === "LIVE") {
    return "FUNDING_REQUEST";
  }
  if (fundingStatus && fundingStatus !== "Not Requested") {
    return "FUNDING_REQUEST";
  }
  return "PROPOSAL";
};

const deriveWorkflowLifecycleStatus = (
  stage: ProjectStage,
  status: ProjectStatus,
  workflow: Partial<ProjectSubmission["workflow"]>
): WorkflowLifecycleStatus => {
  if (workflow.lifecycleStatus) {
    return workflow.lifecycleStatus;
  }
  if (stage === "PROPOSAL") {
    if (status === "SPONSOR_REVIEW") return "AT_SPONSOR_REVIEW";
    if (status === "PGO_FGO_REVIEW") return "AT_PGO_FGO_REVIEW";
    if (status === "SPO_REVIEW") return "AT_SPO_REVIEW";
    if (status === "REJECTED") return "SPO_DECISION_REJECTED";
    return "DRAFT";
  }
  if (stage === "FUNDING") {
    if (status === "SPONSOR_REVIEW") return "FR_AT_SPONSOR_APPROVALS";
    if (status === "PGO_FGO_REVIEW") return "FR_AT_PGO_FGO_REVIEW";
    if (status === "APPROVED") return "FR_APPROVED";
    if (status === "REJECTED") return "FR_REJECTED";
    return "FR_DRAFT";
  }
  if (status === "CHANGE_REVIEW") return "ARCHIVED";
  return "CLOSED";
};

type AuditLogInput = {
  action: SubmissionAuditEntry["action"];
  stage: ProjectStage;
  status: ProjectStatus;
  workflow: ProjectSubmission["workflow"];
  note: string;
  actorName?: string;
  actorEmail?: string;
  createdAt?: string;
};

type UpdateSubmissionOptions = {
  audit?: Omit<AuditLogInput, "stage" | "status" | "workflow">;
};

const createAuditEntry = (input: AuditLogInput): SubmissionAuditEntry => ({
  id: `audit-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
  action: input.action,
  stage: input.stage,
  status: input.status,
  workflow: {
    entityType: input.workflow.entityType,
    lifecycleStatus: input.workflow.lifecycleStatus,
    sponsorDecision: input.workflow.sponsorDecision,
    pgoDecision: input.workflow.pgoDecision,
    financeDecision: input.workflow.financeDecision,
    spoDecision: input.workflow.spoDecision,
    fundingStatus: input.workflow.fundingStatus,
    lastSavedAt: input.workflow.lastSavedAt,
    lockedAt: input.workflow.lockedAt,
    lockReason: input.workflow.lockReason
  },
  note: input.note,
  actorName: input.actorName?.trim() || undefined,
  actorEmail: input.actorEmail?.trim().toLowerCase() || undefined,
  createdAt: input.createdAt ?? new Date().toISOString()
});

const normalizeAuditTrail = (
  row: Partial<ProjectSubmission>,
  fallback: {
    id: string;
    stage: ProjectStage;
    status: ProjectStatus;
    workflow: ProjectSubmission["workflow"];
    createdAt: string;
    ownerName: string;
    ownerEmail: string;
  }
): SubmissionAuditEntry[] => {
  if (!Array.isArray(row.auditTrail) || row.auditTrail.length === 0) {
    return [
      {
        id: `audit-init-${fallback.id}`,
        action: "CREATED",
        stage: fallback.stage,
        status: fallback.status,
        workflow: {
          entityType: fallback.workflow.entityType,
          lifecycleStatus: fallback.workflow.lifecycleStatus,
          sponsorDecision: fallback.workflow.sponsorDecision,
          pgoDecision: fallback.workflow.pgoDecision,
          financeDecision: fallback.workflow.financeDecision,
          spoDecision: fallback.workflow.spoDecision,
          fundingStatus: fallback.workflow.fundingStatus,
          lastSavedAt: fallback.workflow.lastSavedAt,
          lockedAt: fallback.workflow.lockedAt,
          lockReason: fallback.workflow.lockReason
        },
        note: "Submission created.",
        actorName: fallback.ownerName || "System",
        actorEmail: fallback.ownerEmail?.toLowerCase() || "system@portal.local",
        createdAt: fallback.createdAt
      }
    ];
  }

  return row.auditTrail.map((entry, index) => {
    const action =
      typeof entry.action === "string"
        ? (entry.action as SubmissionAuditEntry["action"])
        : "UPDATED";

    return {
      id: entry.id || `audit-${fallback.id}-${index + 1}`,
      action,
      stage: (entry.stage as ProjectStage) ?? fallback.stage,
      status: (entry.status as ProjectStatus) ?? fallback.status,
      workflow: {
        entityType: entry.workflow?.entityType ?? fallback.workflow.entityType,
        lifecycleStatus: entry.workflow?.lifecycleStatus ?? fallback.workflow.lifecycleStatus,
        sponsorDecision: entry.workflow?.sponsorDecision ?? fallback.workflow.sponsorDecision,
        pgoDecision: entry.workflow?.pgoDecision ?? fallback.workflow.pgoDecision,
        financeDecision: entry.workflow?.financeDecision ?? fallback.workflow.financeDecision,
        spoDecision: entry.workflow?.spoDecision ?? fallback.workflow.spoDecision,
        fundingStatus: entry.workflow?.fundingStatus ?? fallback.workflow.fundingStatus,
        lastSavedAt: entry.workflow?.lastSavedAt ?? fallback.workflow.lastSavedAt,
        lockedAt: entry.workflow?.lockedAt ?? fallback.workflow.lockedAt,
        lockReason: entry.workflow?.lockReason ?? fallback.workflow.lockReason
      },
      note: entry.note ?? "",
      actorName: entry.actorName?.trim() || undefined,
      actorEmail: entry.actorEmail?.trim().toLowerCase() || undefined,
      createdAt: entry.createdAt ?? fallback.createdAt
    };
  });
};

const appendAuditEntry = (
  submission: ProjectSubmission,
  input: UpdateSubmissionOptions["audit"]
): ProjectSubmission => {
  if (!input) {
    return submission;
  }

  const entry = createAuditEntry({
    action: input.action,
    stage: submission.stage,
    status: submission.status,
    workflow: submission.workflow,
    note: input.note,
    actorName: input.actorName,
    actorEmail: input.actorEmail,
    createdAt: input.createdAt
  });

  return {
    ...submission,
    auditTrail: [...(submission.auditTrail ?? []), entry]
  };
};

const zeroInvestmentCell = () => ({
  priorYears: 0,
  currentFiscal: 0,
  future: 0
});

const defaultFinancialGrid = (year = new Date().getFullYear()) => ({
  commencementFiscalYear: year,
  investment: {
    hardware: zeroInvestmentCell(),
    software: zeroInvestmentCell(),
    consultancyVendor: zeroInvestmentCell(),
    premisesRealEstate: zeroInvestmentCell(),
    otherCapital: zeroInvestmentCell(),
    expenses: zeroInvestmentCell()
  },
  incremental: {
    years: [year + 1, year + 2, year + 3, year + 4, year + 5],
    revenue: [0, 0, 0, 0, 0],
    savedCosts: [0, 0, 0, 0, 0],
    addlOperatingCosts: [0, 0, 0, 0, 0]
  }
});

const defaultBusinessCaseData = (): BusinessCaseData => {
  const makeCapitalExpenseRow = (
    id: string,
    group: string,
    label: string,
    isTotal = false
  ): BusinessCaseData["capitalExpenses"]["rows"][number] => ({
    id,
    group,
    label,
    isTotal,
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
  const makeTechnologyApplicationResourceRow = (
    id: string
  ): BusinessCaseData["resourceRequirements"]["technologyApplicationResources"][number] => ({
    id,
    impactedApplication: "",
    availabilityApplicationTier: "",
    strategicOrNonStrategic: "",
    rationaleForCompletingWork: "",
    introducesNewApplication: "",
    decommissionOpportunity: ""
  });
  const makeHumanResourceRow = (
    id: string
  ): BusinessCaseData["resourceRequirements"]["humanResources"][number] => ({
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
  const makeDepreciationSummaryRow = (
    id: string
  ): BusinessCaseData["depreciationSummary"]["rows"][number] => ({
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
  const makeOneTimeCostRow = (
    id: string,
    item: string
  ): BusinessCaseData["oneTimeCosts"]["rows"][number] => ({
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
  const makePLImpactRow = (
    id: string,
    group: string,
    label: string,
    isTotal = false
  ): BusinessCaseData["pAndLImpact"]["rows"][number] => ({
    id,
    group,
    label,
    isTotal,
    priorFys: 0,
    currentYear: 0,
    yearPlus1: 0,
    yearPlus2: 0,
    yearPlus3: 0,
    yearPlus4: 0,
    yearPlus5: 0,
    total: 0
  });

  const rows: BusinessCaseData["capitalExpenses"]["rows"] = [
    makeCapitalExpenseRow("external-consulting", "External Resources", "Consulting / Contractors"),
    makeCapitalExpenseRow("external-vendor", "External Resources", "Vendor"),
    makeCapitalExpenseRow("external-total", "External Resources", "TOTAL External Resources", true),

    makeCapitalExpenseRow("software-os", "IT COSTS - Software", "Operating Systems Software"),
    makeCapitalExpenseRow("software-app", "IT COSTS - Software", "Application Systems Software"),
    makeCapitalExpenseRow("software-consultancy", "IT COSTS - Software", "Consultancy"),
    makeCapitalExpenseRow("software-total", "IT COSTS - Software", "TOTAL Software Cost", true),

    makeCapitalExpenseRow("hardware-desktop", "IT COSTS - Hardware", "Desktop/Workstation Computers"),
    makeCapitalExpenseRow("hardware-laptop", "IT COSTS - Hardware", "Laptop Computers"),
    makeCapitalExpenseRow("hardware-monitors", "IT COSTS - Hardware", "Monitors & Printers"),
    makeCapitalExpenseRow("hardware-servers", "IT COSTS - Hardware", "Servers"),
    makeCapitalExpenseRow("hardware-host", "IT COSTS - Hardware", "Host/Mainframe"),
    makeCapitalExpenseRow("hardware-data-comms", "IT COSTS - Hardware", "Data Communication Equipment"),
    makeCapitalExpenseRow("hardware-voice-comms", "IT COSTS - Hardware", "Voice Communication Equipment"),
    makeCapitalExpenseRow("hardware-atm", "IT COSTS - Hardware", "Automated Banking Machines"),
    makeCapitalExpenseRow("hardware-cellular", "IT COSTS - Hardware", "Cellular Phones"),
    makeCapitalExpenseRow("hardware-pos", "IT COSTS - Hardware", "POS Terminals"),
    makeCapitalExpenseRow("hardware-total", "IT COSTS - Hardware", "TOTAL Hardware Cost", true),

    makeCapitalExpenseRow("furniture-main", "Furniture and Fixtures", "Furniture (desks, chairs, workstations, tables)"),
    makeCapitalExpenseRow("furniture-ac", "Furniture and Fixtures", "Air Conditioners"),
    makeCapitalExpenseRow("furniture-signs-ext", "Furniture and Fixtures", "Signs: External"),
    makeCapitalExpenseRow("furniture-signs-int", "Furniture and Fixtures", "Signs: Internal"),
    makeCapitalExpenseRow("furniture-alarms", "Furniture and Fixtures", "Alarms"),
    makeCapitalExpenseRow("furniture-carpets", "Furniture and Fixtures", "Carpets"),
    makeCapitalExpenseRow("furniture-drapes", "Furniture and Fixtures", "Drapes/Blinds"),
    makeCapitalExpenseRow("furniture-access", "Furniture and Fixtures", "Card Access Control"),
    makeCapitalExpenseRow("furniture-total", "Furniture and Fixtures", "TOTAL Furniture and Fixtures Costs", true),

    makeCapitalExpenseRow("safe-vault-doors", "Safekeeping Cost", "Vault Doors"),
    makeCapitalExpenseRow("safe-safes", "Safekeeping Cost", "Safes"),
    makeCapitalExpenseRow("safe-locks", "Safekeeping Cost", "Safety & Time Locks"),
    makeCapitalExpenseRow("safe-boxes", "Safekeeping Cost", "Built in Safety Deposit Boxes"),
    makeCapitalExpenseRow("safe-vaults", "Safekeeping Cost", "Portable insta-vaults, Anti-Holdup Units, Banker's Safe"),
    makeCapitalExpenseRow("safe-bullet", "Safekeeping Cost", "Bullet Resistive Wickets"),
    makeCapitalExpenseRow("safe-total", "Safekeeping Cost", "TOTAL Safekeeping Cost", true),

    makeCapitalExpenseRow("office-security", "Office Equipment Costs", "Security Cameras"),
    makeCapitalExpenseRow("office-audio", "Office Equipment Costs", "Audio Visual"),
    makeCapitalExpenseRow("office-digital", "Office Equipment Costs", "Portable Digital Cameras"),
    makeCapitalExpenseRow("office-photocopiers", "Office Equipment Costs", "Photocopiers & Proof Encoders"),
    makeCapitalExpenseRow("office-other", "Office Equipment Costs", "Other Office & Mechanical Equipment"),
    makeCapitalExpenseRow("office-total", "Office Equipment Costs", "TOTAL Office Equipment Cost", true),

    makeCapitalExpenseRow("other-banking-pavilion", "Other Costs", "Banking Pavilion"),
    makeCapitalExpenseRow("other-aux-power", "Other Costs", "Auxiliary Power Equipment"),
    makeCapitalExpenseRow("other-total", "Other Costs", "TOTAL Other Costs", true),

    makeCapitalExpenseRow("premises-leasehold", "Premises Costs", "Leasehold Premises"),
    makeCapitalExpenseRow("premises-building", "Premises Costs", "New Building"),
    makeCapitalExpenseRow("premises-total", "Premises Costs", "TOTAL Premises Costs", true),

    makeCapitalExpenseRow("contingency", "Adjustments", "Contingency"),
    makeCapitalExpenseRow("withholding-tax", "Adjustments", "Withholding Tax - Barbados Inland Revenue"),
    makeCapitalExpenseRow("capital-total", "Adjustments", "TOTAL CAPITAL EXPENDITURE", true)
  ];
  const oneTimeCostRows: BusinessCaseData["oneTimeCosts"]["rows"] = [
    makeOneTimeCostRow("ot-training", "Training"),
    makeOneTimeCostRow("ot-staff-travel", "Staff Travel (excl training)"),
    makeOneTimeCostRow("ot-staff-meals", "Staff Expenses - Meals/mileage"),
    makeOneTimeCostRow("ot-staff-overtime", "Staff Expenses - Overtime"),
    makeOneTimeCostRow("ot-vendor", "Vendor Costs"),
    makeOneTimeCostRow("ot-consultancy", "Consultancy"),
    makeOneTimeCostRow("ot-consultants-onsite", "Consultants On-Site Cost"),
    makeOneTimeCostRow("ot-contractors", "Contractors"),
    makeOneTimeCostRow("ot-marketing", "Marketing"),
    makeOneTimeCostRow("ot-seed-funding", "Seed Funding (Requirements & Design)"),
    makeOneTimeCostRow("ot-relocation", "Relocation Costs"),
    makeOneTimeCostRow("ot-professional-fees", "Professional Fees"),
    makeOneTimeCostRow("ot-data-migration", "Data Migration"),
    makeOneTimeCostRow("ot-miscellaneous", "Miscellaneous Costs"),
    makeOneTimeCostRow("ot-contingency", "Contingency"),
    makeOneTimeCostRow("ot-withholding-tax", "Withholding Tax - Barbados Inland Revenue"),
    makeOneTimeCostRow("ot-total", "TOTAL ONE-TIME COSTS")
  ];
  const pAndLImpactRows: BusinessCaseData["pAndLImpact"]["rows"] = [
    makePLImpactRow("pl-revenue-net-interest", "Revenue", "Net interest income"),
    makePLImpactRow("pl-revenue-fees", "Revenue", "Fees & commissions"),
    makePLImpactRow("pl-revenue-other", "Revenue", "Other income"),
    makePLImpactRow("pl-revenue-attrition", "Revenue", "Revenue attrition"),
    makePLImpactRow("pl-revenue-total", "Revenue", "Total Revenue", true),
    makePLImpactRow("pl-saved-staff", "Saved Costs", "Staff costs"),
    makePLImpactRow("pl-saved-it", "Saved Costs", "IT Costs"),
    makePLImpactRow("pl-saved-premises", "Saved Costs", "Premises costs"),
    makePLImpactRow("pl-saved-depreciation", "Saved Costs", "Depreciation"),
    makePLImpactRow("pl-saved-other", "Saved Costs", "Other costs"),
    makePLImpactRow("pl-saved-total", "Saved Costs", "Total Saved Costs", true),
    makePLImpactRow(
      "pl-project-expense-spend",
      "Project Expense Spend (1x)",
      "Project Expense Spend (1x)",
      true
    ),
    makePLImpactRow("pl-additional-salaries", "Additional Operating Costs", "Salaries & Benefits"),
    makePLImpactRow("pl-additional-maintenance", "Additional Operating Costs", "Maintenance / Licensing"),
    makePLImpactRow("pl-additional-decommissioning", "Additional Operating Costs", "Decommissioning"),
    makePLImpactRow("pl-additional-lease", "Additional Operating Costs", "Lease Payments"),
    makePLImpactRow("pl-additional-it", "Additional Operating Costs", "IT Costs"),
    makePLImpactRow("pl-additional-other", "Additional Operating Costs", "<Other specify>"),
    makePLImpactRow(
      "pl-additional-depreciation-amortization",
      "Additional Operating Costs",
      "Depreciation/Amortization"
    ),
    makePLImpactRow(
      "pl-additional-total",
      "Additional Operating Costs",
      "Total Additional Operating Costs",
      true
    ),
    makePLImpactRow("pl-total-expenses", "Summary", "Total Expenses", true),
    makePLImpactRow("pl-nibt", "Summary", "NIBT (Net Business Benefit)", true)
  ];

  return {
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
    humanResources: [makeHumanResourceRow("human-resource-1")],
    technologyApplicationResources: [makeTechnologyApplicationResourceRow("app-resource-1")]
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
    rows
  },
  depreciationSummary: {
    endOfCurrentYearFiscal: "",
    rows: Array.from({ length: 15 }, (_, index) => makeDepreciationSummaryRow(`depreciation-${index + 1}`)),
    depreciationProratingGoLiveOrImplementationDate: "",
    depreciationProratingPeriodsRemainingInLastYear: "",
    notes: ""
  },
  oneTimeCosts: {
    rows: oneTimeCostRows
  },
  pAndLImpact: {
    rows: pAndLImpactRows
  },
  metricsAndKpis: Array.from({ length: 4 }, () => ({
    keyMetricCategory: "",
    keyMetric: "",
    targetValue: "",
    priorFys: "",
    f2026: "",
    f2027: "",
    f2028: "",
    f2029: "",
    f2030: ""
  })),
  opportunitySummary: Array.from({ length: 5 }, () => "")
  };
};

const normalizeBusinessCase = (data: DeepPartial<BusinessCaseData> | undefined): BusinessCaseData => {
  const fallback = defaultBusinessCaseData();
  if (!data) {
    return fallback;
  }

  const normalizedMetrics = Array.from({ length: Math.max(data.metricsAndKpis?.length ?? 0, 4) }, (_, index) => {
    const row = (data.metricsAndKpis?.[index] ??
      {}) as DeepPartial<BusinessCaseData["metricsAndKpis"][number]>;
    return {
      keyMetricCategory: row.keyMetricCategory ?? "",
      keyMetric: row.keyMetric ?? "",
      targetValue: row.targetValue ?? "",
      priorFys: row.priorFys ?? "",
      f2026: row.f2026 ?? "",
      f2027: row.f2027 ?? "",
      f2028: row.f2028 ?? "",
      f2029: row.f2029 ?? "",
      f2030: row.f2030 ?? ""
    };
  });

  const normalizedOpportunity = Array.from(
    { length: Math.max(data.opportunitySummary?.length ?? 0, 5) },
    (_, index) => data.opportunitySummary?.[index] ?? ""
  );
  const legacyInvestmentResourceRow =
    data.investmentRegulationSolution &&
    (
      data.investmentRegulationSolution.impactedApplication ||
      data.investmentRegulationSolution.availabilityApplicationTier ||
      data.investmentRegulationSolution.strategicOrNonStrategic ||
      data.investmentRegulationSolution.rationaleForCompletingWork ||
      data.investmentRegulationSolution.introducesNewApplication ||
      data.investmentRegulationSolution.decommissionOpportunity
    )
      ? {
          id: "app-resource-1",
          impactedApplication: data.investmentRegulationSolution.impactedApplication ?? "",
          availabilityApplicationTier: data.investmentRegulationSolution.availabilityApplicationTier ?? "",
          strategicOrNonStrategic: data.investmentRegulationSolution.strategicOrNonStrategic ?? "",
          rationaleForCompletingWork: data.investmentRegulationSolution.rationaleForCompletingWork ?? "",
          introducesNewApplication: data.investmentRegulationSolution.introducesNewApplication ?? "",
          decommissionOpportunity: data.investmentRegulationSolution.decommissionOpportunity ?? ""
        }
      : null;
  const incomingTechnologyRows = data.resourceRequirements?.technologyApplicationResources;
  const normalizedTechnologyRows = Array.isArray(incomingTechnologyRows) && incomingTechnologyRows.length > 0
    ? incomingTechnologyRows.map((row, index) => ({
        ...fallback.resourceRequirements.technologyApplicationResources[0],
        ...(row ?? {}),
        id: row?.id ?? `app-resource-${index + 1}`
      }))
    : legacyInvestmentResourceRow
      ? [legacyInvestmentResourceRow]
      : [...fallback.resourceRequirements.technologyApplicationResources];
  const incomingHumanRows = data.resourceRequirements?.humanResources;
  const normalizedHumanRows = Array.isArray(incomingHumanRows) && incomingHumanRows.length > 0
    ? incomingHumanRows.map((row, index) => ({
        ...fallback.resourceRequirements.humanResources[0],
        ...(row ?? {}),
        id: row?.id ?? `human-resource-${index + 1}`
      }))
    : [...fallback.resourceRequirements.humanResources];

  const incomingCapitalRows = data.capitalExpenses?.rows ?? [];
  const normalizedCapitalRows = fallback.capitalExpenses.rows.map((fallbackRow, index) => {
    const row = incomingCapitalRows[index] as
      | DeepPartial<BusinessCaseData["capitalExpenses"]["rows"][number]>
      | undefined;

    return {
      ...fallbackRow,
      ...row,
      id: fallbackRow.id,
      group: fallbackRow.group,
      label: fallbackRow.label,
      isTotal: fallbackRow.isTotal
    };
  });
  const incomingDepreciationRows = data.depreciationSummary?.rows ?? [];
  const normalizedDepreciationRows = Array.from(
    { length: Math.max(incomingDepreciationRows.length, fallback.depreciationSummary.rows.length) },
    (_, index) => {
      const fallbackRow = fallback.depreciationSummary.rows[index] ?? {
        ...fallback.depreciationSummary.rows[0],
        id: `depreciation-${index + 1}`
      };
      const row = incomingDepreciationRows[index] as
        | DeepPartial<BusinessCaseData["depreciationSummary"]["rows"][number]>
        | undefined;

      return {
        ...fallbackRow,
        ...row,
        id: row?.id ?? fallbackRow.id ?? `depreciation-${index + 1}`
      };
    }
  );
  const incomingOneTimeRows = data.oneTimeCosts?.rows ?? [];
  const normalizedOneTimeRows = Array.from(
    { length: Math.max(incomingOneTimeRows.length, fallback.oneTimeCosts.rows.length) },
    (_, index) => {
      const fallbackRow = fallback.oneTimeCosts.rows[index] ?? {
        ...fallback.oneTimeCosts.rows[0],
        id: `ot-${index + 1}`,
        item: ""
      };
      const row = incomingOneTimeRows[index] as
        | DeepPartial<BusinessCaseData["oneTimeCosts"]["rows"][number]>
        | undefined;
      return {
        ...fallbackRow,
        ...row,
        id: row?.id ?? fallbackRow.id ?? `ot-${index + 1}`,
        item: row?.item ?? fallbackRow.item
      };
    }
  );
  const incomingPLRows = data.pAndLImpact?.rows ?? [];
  const normalizedPLRows = fallback.pAndLImpact.rows.map((fallbackRow, index) => {
    const row = incomingPLRows[index] as
      | DeepPartial<BusinessCaseData["pAndLImpact"]["rows"][number]>
      | undefined;

    return {
      ...fallbackRow,
      ...row,
      id: fallbackRow.id,
      group: fallbackRow.group,
      label: fallbackRow.label,
      isTotal: fallbackRow.isTotal
    };
  });

  const rawUserExperience = {
    ...fallback.userExperience,
    ...(data.userExperience ?? {})
  };
  const legacyQuadrant = ["A", "B", "C", "D"].includes(rawUserExperience.userExperienceImpact.trim().toUpperCase())
    ? rawUserExperience.userExperienceImpact.trim().toUpperCase()
    : "";
  const normalizedUserExperienceImpact = ["Internal", "External", "Both"].includes(
    rawUserExperience.userExperienceImpact
  )
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
      ...(data.introduction ?? {})
    },
    projectOverview: {
      ...fallback.projectOverview,
      ...(data.projectOverview ?? {})
    },
    scopeSchedule: {
      ...fallback.scopeSchedule,
      ...(data.scopeSchedule ?? {})
    },
    strategyAlignment: {
      ...fallback.strategyAlignment,
      ...(data.strategyAlignment ?? {})
    },
    resourceRequirements: {
      ...fallback.resourceRequirements,
      ...(data.resourceRequirements ?? {}),
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
      ...(data.riskMitigation ?? {})
    },
    investmentRegulationSolution: {
      ...fallback.investmentRegulationSolution,
      ...(data.investmentRegulationSolution ?? {})
    },
    financialSummary: {
      ...fallback.financialSummary,
      ...(data.financialSummary ?? {}),
      restructuringHrBauFunded: {
        ...fallback.financialSummary.restructuringHrBauFunded,
        ...(data.financialSummary?.restructuringHrBauFunded ?? {})
      }
    },
    approvals: {
      ...fallback.approvals,
      ...(data.approvals ?? {})
    },
    benefitRealizationPlan: {
      ...fallback.benefitRealizationPlan,
      ...(data.benefitRealizationPlan ?? {})
    },
    capitalExpenses: {
      projectContingencyPct:
        data.capitalExpenses?.projectContingencyPct ?? fallback.capitalExpenses.projectContingencyPct,
      withholdingTaxRatePct:
        data.capitalExpenses?.withholdingTaxRatePct ?? fallback.capitalExpenses.withholdingTaxRatePct,
      withholdingTaxNote:
        data.capitalExpenses?.withholdingTaxNote ?? fallback.capitalExpenses.withholdingTaxNote,
      rows: normalizedCapitalRows
    },
    depreciationSummary: {
      endOfCurrentYearFiscal:
        data.depreciationSummary?.endOfCurrentYearFiscal ?? fallback.depreciationSummary.endOfCurrentYearFiscal,
      rows: normalizedDepreciationRows,
      depreciationProratingGoLiveOrImplementationDate:
        data.depreciationSummary?.depreciationProratingGoLiveOrImplementationDate ??
        fallback.depreciationSummary.depreciationProratingGoLiveOrImplementationDate,
      depreciationProratingPeriodsRemainingInLastYear:
        data.depreciationSummary?.depreciationProratingPeriodsRemainingInLastYear ??
        fallback.depreciationSummary.depreciationProratingPeriodsRemainingInLastYear,
      notes: data.depreciationSummary?.notes ?? fallback.depreciationSummary.notes
    },
    oneTimeCosts: {
      rows: normalizedOneTimeRows
    },
    pAndLImpact: {
      rows: normalizedPLRows
    },
    metricsAndKpis: normalizedMetrics,
    opportunitySummary: normalizedOpportunity
  };
};

const mergeBusinessCase = (
  current: BusinessCaseData | undefined,
  patch: DeepPartial<BusinessCaseData> | undefined
): BusinessCaseData => {
  if (!patch) {
    return normalizeBusinessCase(current);
  }

  const currentNormalized = normalizeBusinessCase(current);
  const mergedCapitalRows = (() => {
    const baseRows = currentNormalized.capitalExpenses.rows;
    const patchRows = patch.capitalExpenses?.rows;
    if (!patchRows) return baseRows;

    return baseRows.map((row, index) => ({
      ...row,
      ...(patchRows[index] ?? {}),
      id: row.id,
      group: row.group,
      label: row.label,
      isTotal: row.isTotal
    }));
  })();
  const mergedTechnologyRows = (() => {
    const patchRows = patch.resourceRequirements?.technologyApplicationResources;
    if (!patchRows) return currentNormalized.resourceRequirements.technologyApplicationResources;

    return patchRows.map((row, index) => {
      const existing = currentNormalized.resourceRequirements.technologyApplicationResources[index];
      const merged = { ...existing, ...row };
      return {
        id: row?.id ?? existing?.id ?? `app-resource-${index + 1}`,
        impactedApplication: merged.impactedApplication ?? "",
        availabilityApplicationTier: merged.availabilityApplicationTier ?? "",
        strategicOrNonStrategic: merged.strategicOrNonStrategic ?? "",
        rationaleForCompletingWork: merged.rationaleForCompletingWork ?? "",
        introducesNewApplication: merged.introducesNewApplication ?? "",
        decommissionOpportunity: merged.decommissionOpportunity ?? ""
      };
    });
  })();
  const mergedHumanRows = (() => {
    const patchRows = patch.resourceRequirements?.humanResources;
    if (!patchRows) return currentNormalized.resourceRequirements.humanResources;

    return patchRows.map((row, index) => {
      const existing = currentNormalized.resourceRequirements.humanResources[index];
      const merged = { ...existing, ...row };
      return {
        id: row?.id ?? existing?.id ?? `human-resource-${index + 1}`,
        roleDescription: merged.roleDescription ?? "",
        responsibilities: merged.responsibilities ?? "",
        resourceType: merged.resourceType ?? "",
        payGrade: merged.payGrade ?? "",
        resourceName: merged.resourceName ?? "",
        comments: merged.comments ?? "",
        capexOpex: merged.capexOpex ?? "",
        resourceStartDate: merged.resourceStartDate ?? "",
        resourceEndDate: merged.resourceEndDate ?? "",
        hiringRequired: merged.hiringRequired ?? "",
        averageAllocationPct: merged.averageAllocationPct ?? ""
      };
    });
  })();
  const mergedDepreciationRows = (() => {
    const baseRows = currentNormalized.depreciationSummary.rows;
    const patchRows = patch.depreciationSummary?.rows;
    if (!patchRows) return baseRows;

    const targetLength = Math.max(baseRows.length, patchRows.length);
    return Array.from({ length: targetLength }, (_, index) => {
      const existing = baseRows[index] ?? {
        id: `depreciation-${index + 1}`,
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
      };
      const merged = { ...existing, ...(patchRows[index] ?? {}) };
      return {
        ...merged,
        id: patchRows[index]?.id ?? existing.id ?? `depreciation-${index + 1}`
      };
    });
  })();
  const mergedOneTimeCostRows = (() => {
    const baseRows = currentNormalized.oneTimeCosts.rows;
    const patchRows = patch.oneTimeCosts?.rows;
    if (!patchRows) return baseRows;

    const targetLength = Math.max(baseRows.length, patchRows.length);
    return Array.from({ length: targetLength }, (_, index) => {
      const existing = baseRows[index] ?? {
        id: `ot-${index + 1}`,
        item: "",
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
      };
      const merged = { ...existing, ...(patchRows[index] ?? {}) };
      return {
        ...merged,
        id: patchRows[index]?.id ?? existing.id ?? `ot-${index + 1}`,
        item: patchRows[index]?.item ?? existing.item
      };
    });
  })();
  const mergedPLRows = (() => {
    const baseRows = currentNormalized.pAndLImpact.rows;
    const patchRows = patch.pAndLImpact?.rows;
    if (!patchRows) return baseRows;

    return baseRows.map((row, index) => ({
      ...row,
      ...(patchRows[index] ?? {}),
      id: row.id,
      group: row.group,
      label: row.label,
      isTotal: row.isTotal
    }));
  })();

  return normalizeBusinessCase({
    ...currentNormalized,
    ...patch,
    introduction: {
      ...currentNormalized.introduction,
      ...(patch.introduction ?? {})
    },
    projectOverview: {
      ...currentNormalized.projectOverview,
      ...(patch.projectOverview ?? {})
    },
    scopeSchedule: {
      ...currentNormalized.scopeSchedule,
      ...(patch.scopeSchedule ?? {})
    },
    strategyAlignment: {
      ...currentNormalized.strategyAlignment,
      ...(patch.strategyAlignment ?? {})
    },
    resourceRequirements: {
      ...currentNormalized.resourceRequirements,
      ...(patch.resourceRequirements ?? {}),
      humanResources: mergedHumanRows,
      technologyApplicationResources: mergedTechnologyRows
    },
    userExperience: {
      ...currentNormalized.userExperience,
      ...(patch.userExperience ?? {})
    },
    riskMitigation: {
      ...currentNormalized.riskMitigation,
      ...(patch.riskMitigation ?? {})
    },
    investmentRegulationSolution: {
      ...currentNormalized.investmentRegulationSolution,
      ...(patch.investmentRegulationSolution ?? {})
    },
    financialSummary: {
      ...currentNormalized.financialSummary,
      ...(patch.financialSummary ?? {}),
      restructuringHrBauFunded: {
        ...currentNormalized.financialSummary.restructuringHrBauFunded,
        ...(patch.financialSummary?.restructuringHrBauFunded ?? {})
      }
    },
    approvals: {
      ...currentNormalized.approvals,
      ...(patch.approvals ?? {})
    },
    benefitRealizationPlan: {
      ...currentNormalized.benefitRealizationPlan,
      ...(patch.benefitRealizationPlan ?? {})
    },
    capitalExpenses: {
      ...currentNormalized.capitalExpenses,
      ...(patch.capitalExpenses ?? {}),
      rows: mergedCapitalRows
    },
    depreciationSummary: {
      ...currentNormalized.depreciationSummary,
      ...(patch.depreciationSummary ?? {}),
      rows: mergedDepreciationRows
    },
    oneTimeCosts: {
      ...currentNormalized.oneTimeCosts,
      ...(patch.oneTimeCosts ?? {}),
      rows: mergedOneTimeCostRows
    },
    pAndLImpact: {
      ...currentNormalized.pAndLImpact,
      ...(patch.pAndLImpact ?? {}),
      rows: mergedPLRows
    }
  });
};

const normalizeFinancialGrid = (grid: Partial<FinancialGrid> | undefined) => {
  const fallback = defaultFinancialGrid();
  if (!grid) {
    return fallback;
  }

  const investment = grid.investment ?? fallback.investment;
  const incremental = grid.incremental ?? fallback.incremental;

  const years =
    Array.isArray(incremental.years) && incremental.years.length === 5
      ? incremental.years
      : fallback.incremental.years;

  const toFive = (values?: number[]) =>
    Array.isArray(values) && values.length === 5
      ? values.map((value) => (Number.isFinite(value) ? value : 0))
      : [0, 0, 0, 0, 0];

    return {
      commencementFiscalYear: grid.commencementFiscalYear ?? fallback.commencementFiscalYear,
      investment: {
      hardware: investment.hardware ?? fallback.investment.hardware,
      software: investment.software ?? fallback.investment.software,
      consultancyVendor: investment.consultancyVendor ?? fallback.investment.consultancyVendor,
      premisesRealEstate: investment.premisesRealEstate ?? fallback.investment.premisesRealEstate,
      otherCapital: investment.otherCapital ?? fallback.investment.otherCapital,
      expenses: investment.expenses ?? fallback.investment.expenses
      },
      incremental: {
      years,
      revenue: toFive(incremental.revenue),
      savedCosts: toFive(incremental.savedCosts),
      addlOperatingCosts: toFive(incremental.addlOperatingCosts)
      }
    };
};

const nowIso = () => new Date().toISOString();
const normalizeObjectId = (value?: string | null) => (value ?? "").trim();
const normalizeOptionalText = (value?: string | null) => (value ?? "").trim();
const normalizeEmail = (value?: string | null) => (value ?? "").trim().toLowerCase();

const toPersonRef = (
  input:
    | Partial<ProjectPersonRef>
    | {
        displayName?: string;
        email?: string;
      }
    | null
    | undefined
): ProjectPersonRef | null => {
  if (!input) {
    return null;
  }
  const displayName = normalizeOptionalText(input.displayName);
  const email = normalizeEmail(input.email);
  if (!displayName && !email) {
    return null;
  }

  return {
    azureObjectId: normalizeObjectId((input as ProjectPersonRef).azureObjectId) || `legacy-${email || displayName}`,
    displayName: displayName || email || "Unassigned",
    email: email || resolveSponsorEmail(displayName, email),
    jobTitle: normalizeOptionalText((input as ProjectPersonRef).jobTitle),
    photoUrl: normalizeOptionalText((input as ProjectPersonRef).photoUrl) || undefined
  };
};

const normalizeSponsorContacts = (
  row: Partial<ProjectSubmission>,
  sponsorName: string,
  sponsorEmail: string
): SponsorContacts | undefined => {
  const existing = row.sponsorContacts ?? {};
  const businessSponsor = toPersonRef(
    existing.businessSponsor ?? {
      displayName: row.businessSponsor ?? sponsorName,
      email: sponsorEmail
    }
  );
  const businessDelegate = toPersonRef(
    existing.businessDelegate ?? {
      displayName: row.businessDelegate ?? row.businessCase?.introduction?.businessDelegate ?? "",
      email: ""
    }
  );
  const technologySponsor = toPersonRef(
    existing.technologySponsor ?? {
      displayName: row.technologySponsor ?? row.businessCase?.introduction?.technologySponsor ?? "",
      email: ""
    }
  );
  const financeSponsor = toPersonRef(
    existing.financeSponsor ?? {
      displayName: row.financeSponsor ?? row.businessCase?.introduction?.financeSponsor ?? "",
      email: ""
    }
  );
  const benefitsSponsor = toPersonRef(
    existing.benefitsSponsor ?? {
      displayName: row.benefitsSponsor ?? row.businessCase?.introduction?.benefitsSponsor ?? "",
      email: ""
    }
  );

  if (!businessSponsor && !businessDelegate && !technologySponsor && !financeSponsor && !benefitsSponsor) {
    return undefined;
  }

  return {
    businessSponsor,
    businessDelegate,
    technologySponsor,
    financeSponsor,
    benefitsSponsor
  };
};

const toApprovalStatusFromLegacyWorkflow = (
  decision?: ProjectSubmission["workflow"]["sponsorDecision"]
): ApprovalStageStatus => {
  if (decision === "Approved") {
    return "APPROVED";
  }
  if (decision === "Rejected") {
    return "REJECTED";
  }
  return "PENDING";
};

const approvalStageOrder: ApprovalStageCode[] = ["BUSINESS", "TECHNOLOGY", "FINANCE", "BENEFITS"];

const stageIsApplicable = (stage: ApprovalStageCode, sponsors?: SponsorContacts) => {
  switch (stage) {
    case "BUSINESS":
      return Boolean(sponsors?.businessSponsor || sponsors?.businessDelegate);
    case "TECHNOLOGY":
      return Boolean(sponsors?.technologySponsor);
    case "FINANCE":
      return Boolean(sponsors?.financeSponsor);
    case "BENEFITS":
      return Boolean(sponsors?.benefitsSponsor);
    default:
      return false;
  }
};

const normalizeApprovalStages = (
  row: Partial<ProjectSubmission>,
  sponsors?: SponsorContacts,
  workflow?: ProjectSubmission["workflow"]
): ProjectApprovalStageRecord[] => {
  const now = nowIso();
  const existing = Array.isArray(row.approvalStages) ? row.approvalStages : [];
  const byStage = new Map(existing.map((entry) => [entry.stage, entry]));
  const legacyBusinessStatus = toApprovalStatusFromLegacyWorkflow(workflow?.sponsorDecision);

  const applicableStages = approvalStageOrder.filter((stage) => stageIsApplicable(stage, sponsors));
  if (applicableStages.length === 0) {
    return [];
  }

  return applicableStages.map((stage, index) => {
    const current = byStage.get(stage);
    const previousStagesApproved = applicableStages
      .slice(0, index)
      .every((code) => byStage.get(code)?.status === "APPROVED");
    const baseStatus: ApprovalStageStatus =
      index === 0 ? legacyBusinessStatus : previousStagesApproved ? "PENDING" : "PENDING";
    const status = current?.status ?? baseStatus;

    return {
      id: current?.id ?? `approval-${row.id ?? "project"}-${stage.toLowerCase()}`,
      stage,
      status,
      decidedByUserId: current?.decidedByUserId,
      actingAs: current?.actingAs,
      comment: current?.comment,
      decidedAt: current?.decidedAt,
      createdAt: current?.createdAt ?? now,
      updatedAt: current?.updatedAt ?? now
    };
  });
};

const normalizeAssignments = (
  row: Partial<ProjectSubmission>,
  projectId: string
): ProjectAssignment[] => {
  const now = nowIso();
  if (Array.isArray(row.assignments) && row.assignments.length > 0) {
    return row.assignments.map((assignment, index) => ({
      id: assignment.id ?? `assignment-${projectId}-${index + 1}`,
      projectId: assignment.projectId || projectId,
      userId: assignment.userId,
      userEmail: normalizeEmail(assignment.userEmail) || undefined,
      userAzureObjectId: normalizeObjectId(assignment.userAzureObjectId) || undefined,
      assignmentType: normalizeOptionalText(assignment.assignmentType) || "Contributor",
      createdAt: assignment.createdAt ?? now,
      updatedAt: assignment.updatedAt ?? now
    }));
  }
  return [];
};

const normalizeSubmission = (row: Partial<ProjectSubmission>): ProjectSubmission => {
  const baseStage = (row.stage as ProjectStage) ?? LEGACY_STAGE_MAP[String(row.stage)] ?? "PROPOSAL";
  const baseStatus = (row.status as ProjectStatus) ?? LEGACY_STATUS_MAP[String(row.status)] ?? "DRAFT";
  const workflowEntityType =
    row.workflow?.entityType ?? deriveWorkflowEntityType(baseStage, row.workflow?.fundingStatus);
  const lifecycleStatus = deriveWorkflowLifecycleStatus(baseStage, baseStatus, row.workflow ?? {});
  const lifecycleLegacy = mapLifecycleToStageStatus(lifecycleStatus);
  const stage = row.workflow?.lifecycleStatus ? lifecycleLegacy.stage : baseStage;
  const status = row.workflow?.lifecycleStatus ? lifecycleLegacy.status : baseStatus;
  const id = toCaseId(row.id ?? "SP-2026-001");
  const specificClassificationType = row.specificClassificationType ?? "";
  const projectClassification =
    row.projectClassification ?? deriveProjectClassification(specificClassificationType);
  const sponsorName = resolveSponsorName(row.businessSponsor, row.sponsorName);
  const sponsorEmail = resolveSponsorEmail(sponsorName, row.sponsorEmail);
  const ownerName = row.ownerName?.trim() || "Project Owner";
  const ownerEmail = row.ownerEmail?.trim() || "owner@portal.local";
  const createdAt = row.createdAt ?? new Date().toISOString();
  const workflow: ProjectSubmission["workflow"] = {
    entityType: workflowEntityType,
    lifecycleStatus,
    sponsorDecision: row.workflow?.sponsorDecision ?? "Pending",
    pgoDecision: row.workflow?.pgoDecision ?? "Pending",
    financeDecision: row.workflow?.financeDecision ?? "Pending",
    spoDecision: row.workflow?.spoDecision ?? "Pending",
    fundingStatus: row.workflow?.fundingStatus ?? "Not Requested",
    lastSavedAt: row.workflow?.lastSavedAt ?? row.updatedAt ?? createdAt,
    lockedAt: row.workflow?.lockedAt,
    lockReason: row.workflow?.lockReason
  };
  const sponsorContacts = normalizeSponsorContacts(row, sponsorName, sponsorEmail);
  const approvalStages = normalizeApprovalStages(row, sponsorContacts, workflow);
  const assignments = normalizeAssignments(row, id);
  const createdByUserId =
    normalizeOptionalText(row.createdByUserId) ||
    (ownerEmail && ownerEmail !== "owner@portal.local" ? `owner-${ownerEmail}` : undefined);

  return {
    id,
    createdByUserId,
    title: row.title ?? "Untitled Initiative",
    summary: row.summary ?? "",
    businessUnit: row.businessUnit ?? "Corporate",
    opco: row.opco ?? "",
    category:
      LEGACY_CATEGORY_MAP[String(row.category)] ??
      (row.category as ProjectSubmission["category"]) ??
      "Technology",
    requestType: (row.requestType as ProjectSubmission["requestType"]) ?? "Business Case",
    priority: row.priority ?? "Medium",
    riskLevel: row.riskLevel ?? "Medium",
    regulatoryFlag: row.regulatoryFlag ?? "N",
    executiveSponsor: row.executiveSponsor ?? "",
    businessSponsor: row.businessSponsor ?? sponsorName,
    businessDelegate: row.businessDelegate ?? sponsorContacts?.businessDelegate?.displayName ?? "",
    technologySponsor: row.technologySponsor ?? sponsorContacts?.technologySponsor?.displayName ?? "",
    financeSponsor: row.financeSponsor ?? sponsorContacts?.financeSponsor?.displayName ?? "",
    benefitsSponsor: row.benefitsSponsor ?? sponsorContacts?.benefitsSponsor?.displayName ?? "",
    segmentUnit: row.segmentUnit ?? "",
    projectTheme: row.projectTheme ?? "",
    strategicObjective: row.strategicObjective ?? "",
    specificClassificationType,
    projectClassification,
    projectType: row.projectType ?? deriveProjectType(projectClassification),
    enterpriseProjectTheme: row.enterpriseProjectTheme ?? "",
    portfolioEsc: row.portfolioEsc ?? row.enterpriseProjectTheme ?? "",
    sponsorName,
    sponsorEmail,
    sponsorContacts,
    assignments,
    approvalStages,
    ownerName,
    ownerEmail,
    startDate: row.startDate,
    endDate: row.endDate,
    targetGoLive: row.targetGoLive,
    status,
    stage,
    committeeDecision: row.committeeDecision ?? null,
    workflow,
    dueDate: row.dueDate ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 21).toISOString(),
    benefits: {
      costSaveEst: row.benefits?.costSaveEst ?? row.financials?.runRateSavings ?? 0,
      revenueUpliftEst: row.benefits?.revenueUpliftEst ?? 0,
      qualitativeBenefits: row.benefits?.qualitativeBenefits ?? "",
      financialAssumptions: row.benefits?.financialAssumptions ?? "",
      intangibleAssumptions: row.benefits?.intangibleAssumptions ?? ""
    },
    dependencies: Array.isArray(row.dependencies) ? row.dependencies : [],
    financialGrid: normalizeFinancialGrid(row.financialGrid),
    businessCase: normalizeBusinessCase(row.businessCase),
    financials: {
      capex: row.financials?.capex ?? 0,
      opex: row.financials?.opex ?? 0,
      oneTimeCosts: row.financials?.oneTimeCosts ?? 0,
      runRateSavings: row.financials?.runRateSavings ?? 0,
      paybackMonths: row.financials?.paybackMonths ?? 0,
      paybackYears: row.financials?.paybackYears ?? (row.financials?.paybackMonths ?? 0) / 12,
      npv: row.financials?.npv ?? 0,
      irr: row.financials?.irr ?? 0
    },
    createdAt,
    updatedAt: row.updatedAt ?? new Date().toISOString(),
    auditTrail: normalizeAuditTrail(row, {
      id,
      stage,
      status,
      workflow,
      createdAt,
      ownerName,
      ownerEmail
    })
  };
};

const demoData = (): ProjectSubmission[] => {
  const now = Date.now();
  const mk = (
    idx: number,
    stage: ProjectStage,
    status: ProjectStatus,
    businessUnit: string,
    title: string,
    savings: number,
    wf: Partial<ProjectSubmission["workflow"]>
  ): ProjectSubmission => ({
    ...normalizeSubmission({
      id: `SP-2026-${String(idx).padStart(3, "0")}`,
      title,
      summary: `${title} strategic initiative with measurable benefits and governance tracking.`,
      businessUnit,
      category: idx % 2 ? "Technology" : "Premise",
      requestType: idx % 3 ? "Business Case" : "Placemat",
      priority: idx % 4 === 0 ? "High" : "Medium",
      riskLevel: idx % 5 === 0 ? "High" : "Medium",
      regulatoryFlag: idx % 3 === 0 ? "Y" : "N",
      executiveSponsor: "Alex Executive",
      businessSponsor: "Jordan Sponsor",
      sponsorName: "Jordan Sponsor",
      ownerName: `Owner ${idx}`,
      ownerEmail: `owner${idx}@portal.local`,
      opco: idx % 2 ? "CIBC Canada" : "CIBC US",
      segmentUnit: idx % 2 ? "Transformation - Governance & Control" : "Technology - Digital",
      projectTheme: idx % 2 ? "Business Continuity" : "Innovative",
      strategicObjective: idx % 2 ? "Client Growth" : "Cost Optimization",
      specificClassificationType: idx % 2 ? "PRO - Productivity" : "MOP - Maintain Operations",
      projectClassification: deriveProjectClassification(
        idx % 2 ? "PRO - Productivity" : "MOP - Maintain Operations"
      ),
      projectType: deriveProjectType(
        deriveProjectClassification(idx % 2 ? "PRO - Productivity" : "MOP - Maintain Operations")
      ),
      enterpriseProjectTheme: idx % 2 ? "Enterprise Resilience" : "Digital Modernization",
      startDate: new Date(now - idx * 7 * 86400000).toISOString(),
      endDate: new Date(now + idx * 30 * 86400000).toISOString(),
      targetGoLive: new Date(now + idx * 45 * 86400000).toISOString(),
      stage,
      status,
      workflow: {
        entityType: wf.entityType ?? deriveWorkflowEntityType(stage, wf.fundingStatus),
        lifecycleStatus: wf.lifecycleStatus ?? deriveWorkflowLifecycleStatus(stage, status, wf),
        sponsorDecision: wf.sponsorDecision ?? "Pending",
        pgoDecision: wf.pgoDecision ?? "Pending",
        financeDecision: wf.financeDecision ?? "Pending",
        spoDecision: wf.spoDecision ?? "Pending",
        fundingStatus: wf.fundingStatus ?? "Not Requested"
      },
      dueDate: new Date(now + idx * 3 * 86400000).toISOString(),
      benefits: {
        costSaveEst: Math.round(savings * 0.7),
        revenueUpliftEst: Math.round(savings * 0.3),
        qualitativeBenefits: "Improves client experience and operational resilience.",
        financialAssumptions: "Revenue growth and cost reduction assumptions validated with finance.",
        intangibleAssumptions: "Improves risk posture, compliance, and employee productivity."
      },
      dependencies: idx > 2 ? [`SP-2026-${String(idx - 1).padStart(3, "0")}`] : [],
      financialGrid: defaultFinancialGrid(2026),
      financials: {
        capex: 150000 + idx * 65000,
        opex: 55000 + idx * 10000,
        oneTimeCosts: 20000 + idx * 7000,
        runRateSavings: savings,
        paybackMonths: 10 + idx,
        paybackYears: (10 + idx) / 12,
        npv: savings * 2,
        irr: 0
      },
      createdAt: new Date(now - idx * 5 * 86400000).toISOString(),
      updatedAt: new Date(now - idx * 86400000).toISOString()
    })
  });

  return [
    mk(1, "PROPOSAL", "DRAFT", "Supply Chain", "Route Optimization Program", 250000, {
      entityType: "PROPOSAL",
      lifecycleStatus: "DRAFT"
    }),
    mk(2, "PROPOSAL", "SPONSOR_REVIEW", "Finance", "Invoice Automation", 310000, {
      entityType: "PROPOSAL",
      lifecycleStatus: "AT_SPONSOR_REVIEW",
      sponsorDecision: "Pending"
    }),
    mk(3, "PROPOSAL", "PGO_FGO_REVIEW", "Operations", "Asset Utilization Pilot", 420000, {
      entityType: "PROPOSAL",
      lifecycleStatus: "AT_PGO_FGO_REVIEW",
      sponsorDecision: "Approved",
      pgoDecision: "Pending",
      financeDecision: "Pending"
    }),
    mk(4, "PROPOSAL", "SPO_REVIEW", "HR", "Workforce Scheduling Modernization", 360000, {
      entityType: "PROPOSAL",
      lifecycleStatus: "AT_SPO_REVIEW",
      sponsorDecision: "Approved",
      pgoDecision: "Approved",
      financeDecision: "Approved",
      spoDecision: "Pending",
      fundingStatus: "Requested"
    }),
    mk(5, "FUNDING", "DRAFT", "IT", "Cloud Cost Rationalization", 520000, {
      entityType: "FUNDING_REQUEST",
      lifecycleStatus: "FR_DRAFT",
      sponsorDecision: "Approved",
      pgoDecision: "Approved",
      financeDecision: "Approved",
      spoDecision: "Approved",
      fundingStatus: "Requested"
    }),
    mk(6, "FUNDING", "SPONSOR_REVIEW", "Commercial", "Dynamic Pricing Initiative", 290000, {
      entityType: "FUNDING_REQUEST",
      lifecycleStatus: "FR_AT_SPONSOR_APPROVALS",
      sponsorDecision: "Pending",
      pgoDecision: "Pending",
      financeDecision: "Pending",
      spoDecision: "Pending",
      fundingStatus: "Requested"
    }),
    mk(7, "FUNDING", "APPROVED", "Manufacturing", "Plant Throughput Expansion", 610000, {
      entityType: "FUNDING_REQUEST",
      lifecycleStatus: "FR_APPROVED",
      sponsorDecision: "Approved",
      pgoDecision: "Approved",
      financeDecision: "Approved",
      spoDecision: "Approved",
      fundingStatus: "Funded"
    })
  ];
};

const readStore = async (): Promise<ProjectSubmission[]> => {
  if (inMemorySubmissions) {
    return cloneJson(inMemorySubmissions);
  }
  try {
    const raw = await fs.readFile(storeFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<ProjectSubmission>[];
    const normalized = Array.isArray(parsed) ? parsed.map(normalizeSubmission) : [];
    inMemorySubmissions = cloneJson(normalized);
    return normalized;
  } catch {
    const seeded = demoData();
    inMemorySubmissions = cloneJson(seeded);
    await writeStore(seeded);
    for (const submission of seeded) {
      const lifecycleStatus = resolveWorkflowLifecycleStatus(submission);
      if (lifecycleStatus === "AT_SPONSOR_REVIEW") {
        const requests = await createApprovalRequestsForSubmission(submission, ["BUSINESS_SPONSOR"]);
        for (const request of requests) {
          await notifyApprovalRequestCreated(submission, request);
        }
      }
      if (lifecycleStatus === "FR_AT_SPONSOR_APPROVALS") {
        const requiredContexts = getRequiredApprovalRoleContextsForSubmission(submission);
        const requests = await createApprovalRequestsForSubmission(submission, requiredContexts);
        for (const request of requests) {
          await notifyApprovalRequestCreated(submission, request);
        }
      }
      if (lifecycleStatus === "FR_APPROVED") {
        await ensureProjectManagementAssignmentTask(submission);
      }
    }
    return seeded;
  }
};

const writeStore = async (submissions: ProjectSubmission[]) => {
  inMemorySubmissions = cloneJson(submissions);
  await safePersistJson(storeFile, submissions);
};

const nextCaseId = (submissions: ProjectSubmission[]) => {
  const year = new Date().getFullYear();
  const prefix = `SP-${year}-`;

  const maxSeq = submissions
    .map((item) => item.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((acc, n) => Math.max(acc, n), 0);

  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
};

export const listSubmissions = async (): Promise<ProjectSubmission[]> => {
  const rows = await readStore();
  return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
};

export const createSubmission = async (input: CreateSubmissionInput): Promise<ProjectSubmission> => {
  const rows = await readStore();
  const now = new Date().toISOString();

  const created: ProjectSubmission = normalizeSubmission({
    id: nextCaseId(rows),
    status: "DRAFT",
    stage: "PROPOSAL",
    workflow: {
      entityType: "PROPOSAL",
      lifecycleStatus: "DRAFT",
      sponsorDecision: "Pending",
      pgoDecision: "Pending",
      financeDecision: "Pending",
      spoDecision: "Pending",
      fundingStatus: "Not Requested",
      lastSavedAt: now
    },
    createdAt: now,
    updatedAt: now,
    ...input
  });

  rows.push(created);
  await writeStore(rows);

  return created;
};

export const createDraftSubmission = async (input?: SubmissionPatch): Promise<ProjectSubmission> => {
  const rows = await readStore();
  const now = new Date().toISOString();

  const created: ProjectSubmission = normalizeSubmission({
    id: nextCaseId(rows),
    title: input?.title ?? "",
    summary: input?.summary ?? "",
    businessUnit: input?.businessUnit ?? "",
    category: input?.category ?? "Technology",
    requestType: input?.requestType ?? "Business Case",
    priority: input?.priority ?? "Medium",
    riskLevel: input?.riskLevel ?? "Medium",
    regulatoryFlag: input?.regulatoryFlag ?? "N",
    executiveSponsor: input?.executiveSponsor ?? "",
    businessSponsor: input?.businessSponsor ?? input?.sponsorName ?? "",
    segmentUnit: input?.segmentUnit ?? "",
    projectTheme: input?.projectTheme ?? "",
    strategicObjective: input?.strategicObjective ?? "",
    specificClassificationType: input?.specificClassificationType ?? "",
    projectClassification:
      input?.projectClassification ?? deriveProjectClassification(input?.specificClassificationType),
    projectType:
      input?.projectType ??
      deriveProjectType(input?.projectClassification ?? deriveProjectClassification(input?.specificClassificationType)),
    enterpriseProjectTheme: input?.enterpriseProjectTheme ?? "",
    portfolioEsc: input?.portfolioEsc ?? input?.enterpriseProjectTheme ?? "",
    sponsorName: input?.sponsorName ?? input?.businessSponsor ?? "",
    sponsorEmail: input?.sponsorEmail,
    ownerName: input?.ownerName ?? "",
    ownerEmail: input?.ownerEmail ?? "",
    opco: input?.opco ?? "",
    startDate: input?.startDate,
    endDate: input?.endDate,
    targetGoLive: input?.targetGoLive,
    status: "DRAFT",
    stage: "PROPOSAL",
    workflow: {
      entityType: "PROPOSAL",
      lifecycleStatus: "DRAFT",
      sponsorDecision: "Pending",
      pgoDecision: "Pending",
      financeDecision: "Pending",
      spoDecision: "Pending",
      fundingStatus: "Not Requested",
      lastSavedAt: now
    },
    dueDate: input?.dueDate,
    benefits: {
      costSaveEst: input?.benefits?.costSaveEst ?? input?.financials?.runRateSavings ?? 0,
      revenueUpliftEst: input?.benefits?.revenueUpliftEst ?? 0,
      qualitativeBenefits: input?.benefits?.qualitativeBenefits ?? "",
      financialAssumptions: input?.benefits?.financialAssumptions ?? "",
      intangibleAssumptions: input?.benefits?.intangibleAssumptions ?? ""
    },
    dependencies: input?.dependencies ?? [],
    financialGrid: normalizeFinancialGrid(input?.financialGrid),
    businessCase: normalizeBusinessCase(input?.businessCase),
    financials: {
      capex: input?.financials?.capex ?? 0,
      opex: input?.financials?.opex ?? 0,
      oneTimeCosts: input?.financials?.oneTimeCosts ?? 0,
      runRateSavings: input?.financials?.runRateSavings ?? 0,
      paybackMonths: input?.financials?.paybackMonths ?? 0,
      paybackYears: input?.financials?.paybackYears ?? (input?.financials?.paybackMonths ?? 0) / 12,
      npv: input?.financials?.npv ?? 0,
      irr: input?.financials?.irr ?? 0
    },
    createdAt: now,
    updatedAt: now
  });

  rows.push(created);
  await writeStore(rows);
  return created;
};

export const getSubmissionById = async (id: string): Promise<ProjectSubmission | null> => {
  const rows = await readStore();
  return rows.find((item) => item.id === id) ?? null;
};

export const updateSubmission = async (
  id: string,
  patch: SubmissionPatch,
  options?: UpdateSubmissionOptions
): Promise<ProjectSubmission | null> => {
  const rows = await readStore();
  const index = rows.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }

  const current = rows[index];
  const normalized: ProjectSubmission = normalizeSubmission({
    ...current,
    ...patch,
    workflow: {
      ...current.workflow,
      ...(patch.workflow ?? {})
    },
    benefits: {
      ...current.benefits,
      ...(patch.benefits ?? {})
    },
    financialGrid: patch.financialGrid
      ? normalizeFinancialGrid({
          ...(current.financialGrid ?? defaultFinancialGrid()),
          ...patch.financialGrid
        })
      : current.financialGrid,
    businessCase: patch.businessCase
      ? mergeBusinessCase(current.businessCase, patch.businessCase)
      : current.businessCase,
    financials: {
      ...current.financials,
      ...(patch.financials ?? {})
    },
    updatedAt: new Date().toISOString()
  });
  const updated = appendAuditEntry(normalized, options?.audit);

  rows[index] = updated;
  await writeStore(rows);
  return updated;
};

const getSponsorContact = (submission: ProjectSubmission) => {
  const name = resolveSponsorName(submission.businessSponsor, submission.sponsorName);
  const email = resolveSponsorEmail(name, submission.sponsorEmail);
  return { name, email };
};

const sponsorApprovalHref = (submission: ProjectSubmission) =>
  `/submissions/${submission.id}/edit?focus=sponsor-approval`;

const notify = async (
  submission: ProjectSubmission,
  title: string,
  body: string,
  href = `/submissions/${submission.id}/edit`,
  recipientEmail?: string
) => {
  await notifyWorkflowEvent({
    toEmail: recipientEmail,
    title,
    body,
    href
  });
  try {
    await appendGovernanceAuditLog({
      area: "WORKFLOW",
      action: "NOTIFICATION_SENT",
      entityType: "submission",
      entityId: submission.id,
      outcome: "SUCCESS",
      actorName: "Workflow System",
      actorEmail: "system@portal.local",
      details: title,
      metadata: {
        recipientEmail: recipientEmail ?? "",
        href
      }
    });
  } catch {
    // Non-blocking audit write.
  }
};

const dispatchSponsorApprovalRequest = async (
  submission: ProjectSubmission,
  context?: { reason?: string }
) => {
  const sponsor = getSponsorContact(submission);
  const approvalHref = sponsorApprovalHref(submission);
  const reason = context?.reason?.trim();

  await notify(
    submission,
    `${submission.id} sent for sponsor approval`,
    `Approval request sent to ${sponsor.name} (${sponsor.email}) via Teams and email.`,
    approvalHref
  );
  await notify(
    submission,
    `${submission.id} awaiting your approval`,
    `Please review and decide. ${reason ? `Note: ${reason}. ` : ""}Intake summary PDF is attached in workflow message.`,
    approvalHref,
    sponsor.email
  );
  await notify(
    submission,
    `${submission.id} submitted`,
    `Your request was sent to sponsor ${sponsor.name} for approval.`,
    approvalHref,
    submission.ownerEmail
  );
};

export const reassignSponsorReviewer = async (
  id: string,
  input: {
    reviewerName: string;
    reviewerEmail: string;
    actorName: string;
    actorEmail: string;
    comment?: string;
  }
): Promise<ProjectSubmission | null> => {
  const updated = await updateSubmission(
    id,
    {
      businessSponsor: input.reviewerName,
      sponsorName: input.reviewerName,
      sponsorEmail: input.reviewerEmail
    },
    {
      audit: {
        action: "REASSIGNED_SPONSOR",
        note: `Sponsor reviewer reassigned to ${input.reviewerName}.`,
        actorName: input.actorName,
        actorEmail: input.actorEmail
      }
    }
  );

  if (!updated) {
    return null;
  }

  await notify(
    updated,
    `${updated.id} sponsor reviewer reassigned`,
    `${input.actorName} reassigned sponsor review to ${input.reviewerName}.${input.comment ? ` Comment: ${input.comment}` : ""}`,
    sponsorApprovalHref(updated)
  );

  await dispatchSponsorApprovalRequest(updated, { reason: input.comment });
  return updated;
};

export const updateSubmissionSponsors = async (
  id: string,
  sponsorContacts: SponsorContacts,
  context?: { actorName?: string; actorEmail?: string }
): Promise<ProjectSubmission | null> => {
  const current = await getSubmissionById(id);
  if (!current) {
    return null;
  }

  const normalizedSponsors: SponsorContacts = {
    businessSponsor: toPersonRef(sponsorContacts.businessSponsor),
    businessDelegate: toPersonRef(sponsorContacts.businessDelegate),
    technologySponsor: toPersonRef(sponsorContacts.technologySponsor),
    financeSponsor: toPersonRef(sponsorContacts.financeSponsor),
    benefitsSponsor: toPersonRef(sponsorContacts.benefitsSponsor)
  };

  const businessSponsorName =
    normalizedSponsors.businessSponsor?.displayName ??
    current.businessSponsor ??
    current.sponsorName;
  const businessSponsorEmail = normalizeEmail(normalizedSponsors.businessSponsor?.email) || current.sponsorEmail;
  const nextApprovals = normalizeApprovalStages(
    {
      ...current,
      sponsorContacts: normalizedSponsors,
      approvalStages: current.approvalStages
    },
    normalizedSponsors,
    current.workflow
  );

  const updated = await updateSubmission(
    id,
    {
      businessSponsor: businessSponsorName,
      businessDelegate: normalizedSponsors.businessDelegate?.displayName ?? "",
      technologySponsor: normalizedSponsors.technologySponsor?.displayName ?? "",
      financeSponsor: normalizedSponsors.financeSponsor?.displayName ?? "",
      benefitsSponsor: normalizedSponsors.benefitsSponsor?.displayName ?? "",
      sponsorName: businessSponsorName,
      sponsorEmail: businessSponsorEmail,
      sponsorContacts: normalizedSponsors,
      approvalStages: nextApprovals
    },
    {
      audit: {
        action: "UPDATED",
        note: "Sponsor assignments updated.",
        actorName: context?.actorName,
        actorEmail: context?.actorEmail
      }
    }
  );

  if (!updated) {
    return null;
  }

  await cancelPendingApprovalRequestsForSubmission(updated, {
    reason: "Pending approval request cancelled due to sponsor change."
  });
  const requiredContexts = getRequiredApprovalRoleContextsForSubmission(updated);
  const created = await createApprovalRequestsForSubmission(
    updated,
    requiredContexts,
    undefined,
    context?.actorEmail
  );
  for (const request of created) {
    await notifyApprovalRequestCreated(updated, request);
  }

  return updated;
};

const readOperationsBoard = async (): Promise<WorkCard[]> => {
  if (inMemoryOperationsBoard) {
    return cloneJson(inMemoryOperationsBoard);
  }
  try {
    const raw = await fs.readFile(operationsBoardFile, "utf8");
    const parsed = JSON.parse(raw) as WorkCard[];
    const rows = Array.isArray(parsed) ? parsed : [];
    inMemoryOperationsBoard = cloneJson(rows);
    return rows;
  } catch {
    inMemoryOperationsBoard = [];
    return [];
  }
};

const isGatingTaskDone = (task: WorkTask) => {
  const taskType = ((task as WorkTask & { taskType?: string }).taskType ?? "").toUpperCase();
  if (taskType === "GOVERNANCE_REVIEW") {
    return task.status === "Done";
  }
  return task.title.trim().toLowerCase() === "conduct proposal placemat gating review" && task.status === "Done";
};

const getGovernanceTaskCompletion = async (
  projectId: string,
  entityType: WorkflowEntityType
): Promise<{ financeDone: boolean; governanceDone: boolean; bothDone: boolean }> => {
  const rows = await readOperationsBoard();
  const inScopeCards = rows.filter((card) => {
    if (card.projectId !== projectId) return false;
    const workflowStage = (card as WorkCard & { workflowStage?: string }).workflowStage;
    if (!workflowStage) return true;
    return workflowStage === entityType;
  });

  const financeCard = inScopeCards.find((card) => card.lane === "Finance");
  const governanceCard = inScopeCards.find((card) => card.lane === "Project Governance");
  const financeDone = Boolean(financeCard?.tasks.some(isGatingTaskDone));
  const governanceDone = Boolean(governanceCard?.tasks.some(isGatingTaskDone));
  return { financeDone, governanceDone, bothDone: financeDone && governanceDone };
};

const ensureGovernanceHubCards = async () => {
  const operationsStoreModule = await import("@/lib/operations/store");
  await operationsStoreModule.listBoardCards();
};

const readProjectManagementTasks = async (): Promise<
  Array<{
    id: string;
    projectId: string;
    fundingRequestId: string;
    taskType: "ASSIGN_PROJECT_MANAGER";
    status: "OPEN" | "CLOSED";
    createdAt: string;
    updatedAt: string;
  }>
> => {
  if (inMemoryProjectManagementTasks) {
    return cloneJson(inMemoryProjectManagementTasks);
  }
  try {
    const raw = await fs.readFile(projectManagementTaskFile, "utf8");
    const parsed = JSON.parse(raw) as Array<{
      id: string;
      projectId: string;
      fundingRequestId: string;
      taskType: "ASSIGN_PROJECT_MANAGER";
      status: "OPEN" | "CLOSED";
      createdAt: string;
      updatedAt: string;
    }>;
    const rows = Array.isArray(parsed) ? parsed : [];
    inMemoryProjectManagementTasks = cloneJson(rows);
    return rows;
  } catch {
    inMemoryProjectManagementTasks = [];
    return [];
  }
};

const writeProjectManagementTasks = async (
  rows: Array<{
    id: string;
    projectId: string;
    fundingRequestId: string;
    taskType: "ASSIGN_PROJECT_MANAGER";
    status: "OPEN" | "CLOSED";
    createdAt: string;
    updatedAt: string;
  }>
) => {
  inMemoryProjectManagementTasks = cloneJson(rows);
  await safePersistJson(projectManagementTaskFile, rows);
};

const ensureProjectManagementAssignmentTask = async (submission: ProjectSubmission) => {
  const rows = await readProjectManagementTasks();
  const existing = rows.find(
    (task) =>
      task.projectId === submission.id &&
      task.fundingRequestId === submission.id &&
      task.taskType === "ASSIGN_PROJECT_MANAGER" &&
      task.status === "OPEN"
  );
  if (existing) {
    return;
  }

  const now = nowIso();
  rows.push({
    id: `pm-task-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    projectId: submission.id,
    fundingRequestId: submission.id,
    taskType: "ASSIGN_PROJECT_MANAGER",
    status: "OPEN",
    createdAt: now,
    updatedAt: now
  });
  await writeProjectManagementTasks(rows);
};

export const recordProjectApprovalDecision = async (
  id: string,
  input: {
    stage: ApprovalStageCode;
    status: Exclude<ApprovalStageStatus, "PENDING">;
    decidedByUserId?: string;
    actingAs?: "SPONSOR" | "DELEGATE";
    comment?: string;
    actorName?: string;
    actorEmail?: string;
  }
): Promise<ProjectSubmission | null> => {
  const current = await getSubmissionById(id);
  if (!current) {
    return null;
  }

  const approvals = normalizeApprovalStages(
    current,
    current.sponsorContacts,
    current.workflow
  );
  const stageIndex = approvals.findIndex((entry) => entry.stage === input.stage);
  if (stageIndex === -1) {
    throw new Error(`Approval stage ${input.stage} is not configured for this project.`);
  }

  const target = approvals[stageIndex];
  if (target.status !== "PENDING") {
    throw new Error(`Approval stage ${input.stage} is not pending.`);
  }

  const decidedAt = nowIso();
  approvals[stageIndex] = {
    ...target,
    status: input.status,
    decidedByUserId: input.decidedByUserId ?? target.decidedByUserId,
    actingAs: input.actingAs ?? target.actingAs,
    comment: input.comment?.trim() || undefined,
    decidedAt,
    updatedAt: decidedAt
  };

  return updateSubmission(
    id,
    {
      approvalStages: approvals
    },
    {
      audit: {
        action: "UPDATED",
        note: `${input.stage} approval marked ${input.status}.`,
        actorName: input.actorName,
        actorEmail: input.actorEmail
      }
    }
  );
};

const buildWorkflowPatchFromLifecycle = (
  submission: ProjectSubmission,
  lifecycleStatus: WorkflowLifecycleStatus,
  workflowPatch?: Partial<ProjectSubmission["workflow"]>
): SubmissionPatch => {
  const now = nowIso();
  const mapped = mapLifecycleToStageStatus(lifecycleStatus);
  const editable = isWorkflowEditableStatus(lifecycleStatus);
  const entityType: WorkflowEntityType = mapped.stage === "PROPOSAL" ? "PROPOSAL" : "FUNDING_REQUEST";

  return {
    stage: mapped.stage,
    status: mapped.status,
    workflow: {
      ...workflowPatch,
      entityType,
      lifecycleStatus,
      lastSavedAt: submission.workflow.lastSavedAt ?? submission.updatedAt,
      lockedAt: editable ? undefined : submission.workflow.lockedAt ?? now,
      lockReason: editable ? undefined : "Submission is locked in the current workflow stage."
    }
  };
};

export const reconcileSubmissionWorkflow = async (
  id: string,
  context?: { actorName?: string; actorEmail?: string; reason?: string }
): Promise<ProjectSubmission | null> => {
  const current = await getSubmissionById(id);
  if (!current) {
    return null;
  }

  const lifecycle = resolveWorkflowLifecycleStatus(current);
  const summary = await getApprovalRequestSummaryForSubmission(current);
  const governance = await getGovernanceTaskCompletion(current.id, current.workflow.entityType);
  const approvalStages = current.approvalStages ?? [];
  const allConfiguredApprovalStagesApproved =
    approvalStages.length > 0 && approvalStages.every((stage) => stage.status === "APPROVED");
  const anyConfiguredApprovalRejected = approvalStages.some((stage) => stage.status === "REJECTED");
  const anyConfiguredApprovalNeedMoreInfo = approvalStages.some((stage) => stage.status === "NEED_MORE_INFO");

  let nextLifecycle = lifecycle;
  let workflowPatch: Partial<ProjectSubmission["workflow"]> = {};
  let committeeDecision: ProjectSubmission["committeeDecision"] | undefined;

  if (lifecycle === "AT_SPONSOR_REVIEW") {
    const anyNeedMoreInfo = summary.rows.some((row) => row.status === "NEED_MORE_INFO");
    if (anyNeedMoreInfo) {
      nextLifecycle = "DRAFT";
      workflowPatch = { sponsorDecision: "Need More Info" };
    } else if (summary.anyRejected) {
      nextLifecycle = "SPO_DECISION_REJECTED";
      workflowPatch = { sponsorDecision: "Rejected" };
      committeeDecision = "REJECTED";
    } else if (summary.allRequiredApproved) {
      nextLifecycle = "AT_PGO_FGO_REVIEW";
      workflowPatch = { sponsorDecision: "Approved", pgoDecision: "Pending", financeDecision: "Pending" };
    }
  } else if (lifecycle === "AT_PGO_FGO_REVIEW") {
    if (governance.bothDone) {
      nextLifecycle = "AT_SPO_REVIEW";
      workflowPatch = { pgoDecision: "Approved", financeDecision: "Approved", spoDecision: "Pending" };
    }
  } else if (lifecycle === "FR_AT_SPONSOR_APPROVALS") {
    if (summary.anyNeedMoreInfo || anyConfiguredApprovalNeedMoreInfo) {
      nextLifecycle = "FR_DRAFT";
      workflowPatch = { sponsorDecision: "Need More Info" };
    } else if (summary.anyRejected || anyConfiguredApprovalRejected) {
      nextLifecycle = "FR_DRAFT";
      workflowPatch = { sponsorDecision: "Rejected" };
    } else if (summary.allRequiredApproved || allConfiguredApprovalStagesApproved) {
      nextLifecycle = "FR_AT_PGO_FGO_REVIEW";
    }
  } else if (lifecycle === "FR_AT_PGO_FGO_REVIEW") {
    if (summary.anyRejected) {
      nextLifecycle = "FR_DRAFT";
      workflowPatch = { pgoDecision: "Rejected", financeDecision: "Rejected" };
    } else if (governance.bothDone) {
      nextLifecycle = "FR_APPROVED";
      workflowPatch = { fundingStatus: "Funded", pgoDecision: "Approved", financeDecision: "Approved" };
    }
  }

  if (nextLifecycle === lifecycle) {
    return current;
  }

  const patch = buildWorkflowPatchFromLifecycle(current, nextLifecycle, workflowPatch);
  if (committeeDecision !== undefined) {
    patch.committeeDecision = committeeDecision;
  }
  const updated = await updateSubmission(id, patch, {
    audit: {
      action: "UPDATED",
      note:
        context?.reason ??
        `Workflow reconciled from ${lifecycle} to ${nextLifecycle}.`,
      actorName: context?.actorName,
      actorEmail: context?.actorEmail
    }
  });
  if (!updated) {
    return null;
  }

  if (nextLifecycle === "AT_PGO_FGO_REVIEW" || nextLifecycle === "FR_AT_PGO_FGO_REVIEW") {
    await ensureGovernanceHubCards();
  }

  if (nextLifecycle === "FR_APPROVED") {
    await ensureProjectManagementAssignmentTask(updated);
    await notify(
      updated,
      `${updated.id} funding request approved`,
      "Funding Request is approved and locked. Project Management task created for PM assignment.",
      `/submissions/${updated.id}/edit`,
      updated.ownerEmail
    );
  } else {
    await notify(
      updated,
      `${updated.id} workflow updated`,
      `Workflow moved to ${nextLifecycle}.`,
      `/submissions/${updated.id}/edit`,
      updated.ownerEmail
    );
  }

  return updated;
};

export const isSponsorUser = (
  submission: ProjectSubmission,
  user: { email?: string | null; role?: string | null }
) => {
  if (!user?.email) {
    return false;
  }

  if (user.role === "ADMIN") {
    return true;
  }

  const normalizedEmail = user.email.toLowerCase();
  const sponsorContacts = submission.sponsorContacts;
  const candidateEmails = new Set<string>();

  const appendEmail = (value?: string | null) => {
    const email = normalizeEmail(value);
    if (email) {
      candidateEmails.add(email);
    }
  };

  appendEmail(sponsorContacts?.businessSponsor?.email);
  appendEmail(sponsorContacts?.businessDelegate?.email);
  appendEmail(sponsorContacts?.technologySponsor?.email);
  appendEmail(sponsorContacts?.financeSponsor?.email);
  appendEmail(sponsorContacts?.benefitsSponsor?.email);
  appendEmail(resolveSponsorEmail(submission.businessSponsor || submission.sponsorName, submission.sponsorEmail));

  return candidateEmails.has(normalizedEmail);
};

export const runWorkflowAction = async (
  id: string,
  action: WorkflowAction,
  context?: { actorName?: string; actorEmail?: string; actorUserId?: string }
): Promise<ProjectSubmission | null> => {
  const submission = await getSubmissionById(id);
  if (!submission) return null;

  const allowedActions = getAllowedWorkflowActions(submission);
  if (!allowedActions.includes(action)) {
    throw new Error(
      `Action ${action} is not allowed for ${submission.stage} (${submission.status}). Allowed: ${allowedActions.join(", ")}`
    );
  }

  const currentLifecycle = resolveWorkflowLifecycleStatus(submission);
  let nextLifecycle = currentLifecycle;
  let workflowPatch: Partial<ProjectSubmission["workflow"]> = {};
  let patch: SubmissionPatch | null = null;

  switch (action) {
    case "SEND_TO_SPONSOR":
      nextLifecycle = "AT_SPONSOR_REVIEW";
      workflowPatch = {
        entityType: "PROPOSAL",
        sponsorDecision: "Pending",
        pgoDecision: "Pending",
        financeDecision: "Pending",
        spoDecision: "Pending",
        fundingStatus: "Not Requested"
      };
      break;
    case "SUBMIT_FUNDING_REQUEST":
      nextLifecycle = "FR_AT_SPONSOR_APPROVALS";
      workflowPatch = {
        entityType: "FUNDING_REQUEST",
        sponsorDecision: "Pending",
        pgoDecision: "Pending",
        financeDecision: "Pending",
        spoDecision: "Pending",
        fundingStatus: "Requested"
      };
      break;
    case "SPO_APPROVE":
      nextLifecycle = "FR_DRAFT";
      workflowPatch = {
        entityType: "FUNDING_REQUEST",
        sponsorDecision: "Pending",
        pgoDecision: "Pending",
        financeDecision: "Pending",
        spoDecision: "Approved",
        fundingStatus: "Requested"
      };
      patch = {
        ...buildWorkflowPatchFromLifecycle(submission, nextLifecycle, workflowPatch),
        committeeDecision: "APPROVED"
      };
      break;
    case "SPO_REJECT":
      nextLifecycle = "SPO_DECISION_REJECTED";
      workflowPatch = { spoDecision: "Rejected" };
      patch = {
        ...buildWorkflowPatchFromLifecycle(submission, nextLifecycle, workflowPatch),
        committeeDecision: "REJECTED"
      };
      break;
    case "RAISE_CHANGE_REQUEST":
      patch = {
        stage: "LIVE",
        status: "CHANGE_REVIEW",
        workflow: {
          ...submission.workflow,
          lifecycleStatus: "ARCHIVED",
          lockReason: "Project is in change review."
        }
      };
      break;
    default:
      throw new Error(`Unsupported workflow action: ${action}`);
  }

  if (!patch) {
    patch = buildWorkflowPatchFromLifecycle(submission, nextLifecycle, workflowPatch);
  }

  const currentApprovalStages = normalizeApprovalStages(
    submission,
    submission.sponsorContacts,
    submission.workflow
  );
  if (currentApprovalStages.length > 0) {
    const clearDecisionFields = (entry: ProjectApprovalStageRecord): ProjectApprovalStageRecord => ({
      ...entry,
      decidedByUserId: undefined,
      actingAs: undefined,
      comment: undefined,
      decidedAt: undefined,
      updatedAt: nowIso()
    });

    const withReset = currentApprovalStages.map(clearDecisionFields);
    if (action === "SEND_TO_SPONSOR" || action === "SUBMIT_FUNDING_REQUEST") {
      patch.approvalStages = withReset.map((entry, index) => ({
        ...entry,
        status: index === 0 ? "PENDING" : "PENDING"
      }));
    }
  }

  const nextStage = patch.stage ?? submission.stage;
  const nextStatus = patch.status ?? submission.status;
  const updated = await updateSubmission(id, patch, {
    audit: {
      action,
      note: `Workflow action ${action} moved record from ${submission.stage}/${submission.status} to ${nextStage}/${nextStatus}.`,
      actorName: context?.actorName,
      actorEmail: context?.actorEmail
    }
  });
  if (!updated) return null;

  const notes: Partial<Record<WorkflowAction, { title: string; body: string }>> = {
    SEND_TO_SPONSOR: {
      title: `${updated.id} sent to sponsor`,
      body: "Proposal submitted and routed to sponsor review."
    },
    SPO_APPROVE: {
      title: `${updated.id} SPO approved`,
      body: "Funding draft is now available for completion."
    },
    SPO_REJECT: {
      title: `${updated.id} SPO rejected`,
      body: "Submission was rejected by SPO committee."
    },
    SUBMIT_FUNDING_REQUEST: {
      title: `${updated.id} funding request submitted`,
      body: "Funding request sent to required sponsors for approval."
    },
    RAISE_CHANGE_REQUEST: {
      title: `${updated.id} moved to change review`,
      body: "Project is now in change review workflow."
    }
  };

  if (action === "SEND_TO_SPONSOR") {
    await cancelPendingApprovalRequestsForSubmission(updated, {
      reason: "Superseded by a new proposal sponsor review submission."
    });
    const requests = await createApprovalRequestsForSubmission(
      updated,
      ["BUSINESS_SPONSOR"],
      undefined,
      context?.actorUserId ?? context?.actorEmail
    );
    for (const request of requests) {
      await notifyApprovalRequestCreated(updated, request);
    }
    await dispatchSponsorApprovalRequest(updated);
  }

  if (action === "SUBMIT_FUNDING_REQUEST") {
    await cancelPendingApprovalRequestsForSubmission(updated, {
      reason: "Superseded by a newly submitted funding request."
    });
    const requiredContexts = getRequiredApprovalRoleContextsForSubmission(updated);
    const requests = await createApprovalRequestsForSubmission(
      updated,
      requiredContexts,
      undefined,
      context?.actorUserId ?? context?.actorEmail
    );
    for (const request of requests) {
      await notifyApprovalRequestCreated(updated, request);
    }
  }

  const note = notes[action] ?? {
    title: `${updated.id} workflow updated`,
    body: `Workflow action ${action} was processed.`
  };
  await notify(updated, note.title, note.body);

  const reconciled = await reconcileSubmissionWorkflow(id, {
    actorName: context?.actorName,
    actorEmail: context?.actorEmail,
    reason: `Reconciled after workflow action ${action}.`
  });

  return reconciled ?? updated;
};
