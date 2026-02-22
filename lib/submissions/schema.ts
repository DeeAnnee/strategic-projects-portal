import { z } from "zod";
import { DATE_ORDER_ERROR_MESSAGE, isEndBeforeStart } from "@/lib/submissions/date-validation";

const stageEnum = z.enum([
  "PROPOSAL",
  "FUNDING",
  "LIVE"
]);

const statusEnum = z.enum([
  "DRAFT",
  "SPONSOR_REVIEW",
  "PGO_FGO_REVIEW",
  "SPO_REVIEW",
  "REJECTED",
  "APPROVED",
  "ACTIVE",
  "CHANGE_REVIEW"
]);

const decisionEnum = z.enum(["Pending", "Approved", "Rejected", "Need More Info"]);
const workflowEntityTypeEnum = z.enum(["PROPOSAL", "FUNDING_REQUEST"]);
const workflowLifecycleStatusEnum = z.enum([
  "DRAFT",
  "AT_SPONSOR_REVIEW",
  "AT_PGO_FGO_REVIEW",
  "AT_SPO_REVIEW",
  "SPO_DECISION_APPROVED",
  "SPO_DECISION_REJECTED",
  "SPO_DECISION_DEFERRED",
  "FR_DRAFT",
  "FR_AT_SPONSOR_APPROVALS",
  "FR_AT_PGO_FGO_REVIEW",
  "FR_APPROVED",
  "FR_REJECTED",
  "CLOSED",
  "ARCHIVED"
]);
const approvalStageEnum = z.enum(["BUSINESS", "TECHNOLOGY", "FINANCE", "BENEFITS", "PROJECT_MANAGER"]);
const approvalStatusEnum = z.enum(["PENDING", "APPROVED", "REJECTED", "NEED_MORE_INFO"]);
const approvalActingAsEnum = z.enum(["SPONSOR", "DELEGATE"]);

const projectPersonRefSchema = z.object({
  azureObjectId: z.string().min(1).max(200),
  displayName: z.string().min(1).max(200),
  email: z.string().email(),
  jobTitle: z.string().max(200),
  photoUrl: z.string().url().optional()
});

const sponsorContactsSchema = z.object({
  businessSponsor: projectPersonRefSchema.nullable().optional(),
  businessDelegate: projectPersonRefSchema.nullable().optional(),
  technologySponsor: projectPersonRefSchema.nullable().optional(),
  financeSponsor: projectPersonRefSchema.nullable().optional(),
  benefitsSponsor: projectPersonRefSchema.nullable().optional()
});

const projectAssignmentSchema = z.object({
  id: z.string().min(1).max(200),
  projectId: z.string().min(1).max(100),
  userId: z.string().max(200).optional(),
  userEmail: z.string().email().optional(),
  userAzureObjectId: z.string().max(200).optional(),
  assignmentType: z.string().min(1).max(100),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

const projectApprovalStageSchema = z.object({
  id: z.string().min(1).max(200),
  stage: approvalStageEnum,
  status: approvalStatusEnum,
  decidedByUserId: z.string().max(200).optional(),
  actingAs: approvalActingAsEnum.optional(),
  comment: z.string().max(2000).optional(),
  decidedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

const investmentCellSchema = z.object({
  priorYears: z.coerce.number().min(0),
  currentFiscal: z.coerce.number().min(0),
  future: z.coerce.number().min(0)
});

const financialGridSchema = z.object({
  commencementFiscalYear: z.coerce.number().int().min(2020).max(2100),
  investment: z.object({
    hardware: investmentCellSchema,
    software: investmentCellSchema,
    consultancyVendor: investmentCellSchema,
    premisesRealEstate: investmentCellSchema,
    otherCapital: investmentCellSchema,
    expenses: investmentCellSchema
  }),
  incremental: z.object({
    years: z.array(z.coerce.number().int().min(2020).max(2100)).length(5),
    revenue: z.array(z.coerce.number().min(0)).length(5),
    savedCosts: z.array(z.coerce.number().min(0)).length(5),
    addlOperatingCosts: z.array(z.coerce.number().min(0)).length(5)
  })
});

const businessCaseMetricRowSchema = z.object({
  keyMetricCategory: z.string().max(120),
  keyMetric: z.string().max(200),
  targetValue: z.string().max(120),
  priorFys: z.string().max(120),
  f2026: z.string().max(120),
  f2027: z.string().max(120),
  f2028: z.string().max(120),
  f2029: z.string().max(120),
  f2030: z.string().max(120)
});

const businessCaseTechnologyApplicationResourceRowSchema = z.object({
  id: z.string().max(120),
  impactedApplication: z.string().max(2000),
  availabilityApplicationTier: z.string().max(120),
  strategicOrNonStrategic: z.string().max(120),
  rationaleForCompletingWork: z.string().max(4000),
  introducesNewApplication: z.string().max(120),
  decommissionOpportunity: z.string().max(120)
});

const businessCaseHumanResourceRowSchema = z
  .object({
    id: z.string().max(120),
    roleDescription: z.string().max(300),
    responsibilities: z.string().max(2000),
    resourceType: z.string().max(120),
    payGrade: z.string().max(120),
    resourceName: z.string().max(200),
    comments: z.string().max(2000),
    capexOpex: z.string().max(120),
    resourceStartDate: z.string().max(40),
    resourceEndDate: z.string().max(40),
    hiringRequired: z.string().max(120),
    averageAllocationPct: z.string().max(40)
  })
  .superRefine((row, ctx) => {
    if (!row.resourceStartDate || !row.resourceEndDate) {
      return;
    }
    if (isEndBeforeStart(row.resourceStartDate, row.resourceEndDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Resource Start Date cannot be after Resource End Date.",
        path: ["resourceStartDate"]
      });
    }
  });

const businessCaseCapitalExpenseRowSchema = z.object({
  id: z.string().max(120),
  group: z.string().max(120),
  label: z.string().max(180),
  isTotal: z.boolean().optional(),
  quantity: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0),
  totalCost: z.coerce.number().min(0),
  comments: z.string().max(500),
  annualDepreciation: z.coerce.number().min(0),
  priorFys: z.coerce.number().min(0),
  f2025Q1: z.coerce.number().min(0),
  f2025Q2: z.coerce.number().min(0),
  f2025Q3: z.coerce.number().min(0),
  f2025Q4: z.coerce.number().min(0),
  f2025Plan: z.coerce.number().min(0),
  f2026: z.coerce.number().min(0),
  f2027: z.coerce.number().min(0),
  f2028: z.coerce.number().min(0),
  f2029: z.coerce.number().min(0),
  f2030: z.coerce.number().min(0)
});

const businessCaseDepreciationSummaryRowSchema = z.object({
  id: z.string().max(120),
  phase: z.string().max(200),
  category: z.string().max(200),
  capexPrepaidCategory: z.string().max(200),
  phaseStartDate: z.string().max(40),
  phaseEndDate: z.string().max(40),
  usefulLifeYears: z.coerce.number().min(0),
  totalProjectCost: z.coerce.number().min(0),
  projectCostForPhase: z.coerce.number().min(0),
  annualDepreciation: z.coerce.number().min(0),
  priorFys: z.coerce.number().min(0),
  currentYear: z.coerce.number().min(0),
  yearPlus1: z.coerce.number().min(0),
  yearPlus2: z.coerce.number().min(0),
  yearPlus3: z.coerce.number().min(0),
  yearPlus4: z.coerce.number().min(0),
  yearPlus5: z.coerce.number().min(0),
  total: z.coerce.number().min(0)
});

const businessCaseOneTimeCostRowSchema = z.object({
  id: z.string().max(120),
  item: z.string().max(240),
  comments: z.string().max(1000),
  projectTotal: z.coerce.number().min(0),
  priorFys: z.coerce.number().min(0),
  currentYearSpend: z.coerce.number().min(0),
  currentYearPlan: z.coerce.number().min(0),
  yearPlus1: z.coerce.number().min(0),
  yearPlus2: z.coerce.number().min(0),
  yearPlus3: z.coerce.number().min(0),
  yearPlus4: z.coerce.number().min(0),
  yearPlus5: z.coerce.number().min(0),
  total: z.coerce.number().min(0)
});

const businessCaseFinancialSummaryRowSchema = z.object({
  priorFys: z.coerce.number(),
  f2025: z.coerce.number(),
  f2026: z.coerce.number(),
  f2027: z.coerce.number(),
  f2028: z.coerce.number(),
  f2029: z.coerce.number(),
  f2030: z.coerce.number()
});

const businessCasePLImpactRowSchema = z.object({
  id: z.string().max(120),
  group: z.string().max(120),
  label: z.string().max(240),
  isTotal: z.boolean().optional(),
  priorFys: z.coerce.number(),
  currentYear: z.coerce.number(),
  yearPlus1: z.coerce.number(),
  yearPlus2: z.coerce.number(),
  yearPlus3: z.coerce.number(),
  yearPlus4: z.coerce.number(),
  yearPlus5: z.coerce.number(),
  total: z.coerce.number()
});

const businessCaseDataSchema = z.object({
  introduction: z.object({
    projectInitiativeName: z.string().max(180),
    fundingSource: z.string().max(120),
    fundingType: z.string().max(120),
    ndaProject: z.string().max(80),
    projectCategory: z.string().max(120),
    projectImportance: z.string().max(120),
    projectComplexity: z.string().max(120),
    businessSponsor: z.string().max(120),
    businessDelegate: z.string().max(120),
    technologySponsor: z.string().max(120),
    financeSponsor: z.string().max(120),
    benefitsSponsor: z.string().max(120),
    inPlanForCurrentYear: z.string().max(120),
    currentYear: z.string().max(20),
    endOfFiscalInCurrentYear: z.string().max(40),
    currentYearSpendVsPlan: z.string().max(120),
    totalCostCapexOneTime: z.string().max(120),
    npv5Year: z.string().max(120),
    irr5Year: z.string().max(120),
    paybackYears: z.string().max(120),
    fteUpDown: z.string().max(120),
    annualOngoingCostExcludingDepreciation: z.string().max(120)
  }),
  projectOverview: z.object({
    projectDescription: z.string().max(4000),
    opportunityStatement: z.string().max(4000)
  }),
  scopeSchedule: z.object({
    start: z.string().max(40),
    businessCaseApproval: z.string().max(40),
    goLive: z.string().max(40),
    benefitRealizationStart: z.string().max(40),
    closure: z.string().max(40)
  }),
  strategyAlignment: z.object({
    enterpriseStrategyAlignment: z.string().max(4000),
    keyDependencies: z.string().max(4000)
  }),
  resourceRequirements: z.object({
    internalFteRequirements: z.string().max(4000),
    externalSupportRequired: z.string().max(4000),
    hiringRequired: z.string().max(4000),
    additionalResourceDetails: z.string().max(4000),
    humanResources: z.array(businessCaseHumanResourceRowSchema).max(100),
    technologyApplicationResources: z.array(businessCaseTechnologyApplicationResourceRowSchema).max(50)
  }),
  userExperience: z.object({
    userExperienceImpact: z.string().max(120),
    userExperienceQuadrant: z.string().max(20),
    impactDescription: z.string().max(4000)
  }),
  riskMitigation: z.object({
    riskAssessmentRequired: z.string().max(120),
    ciraReferenceName: z.string().max(200),
    ciraReferenceNumber: z.string().max(120),
    highMediumInherentRisk: z.string().max(4000)
  }),
  investmentRegulationSolution: z.object({
    regulatoryGoverningBody: z.string().max(200),
    specificRegulationNameOrDeficiencyId: z.string().max(250),
    implementationDueDate: z.string().max(40),
    impactedApplication: z.string().max(4000),
    availabilityApplicationTier: z.string().max(120),
    strategicOrNonStrategic: z.string().max(120),
    rationaleForCompletingWork: z.string().max(4000),
    introducesNewApplication: z.string().max(120),
    decommissionOpportunity: z.string().max(120)
  }),
  financialSummary: z.object({
    financialImpactsIncludingWorkforceOperatingCostAndPL: z.string().max(4000),
    restructuringHrBauFunded: businessCaseFinancialSummaryRowSchema
  }),
  approvals: z.object({
    requiredStakeholderApprovals: z.string().max(4000)
  }),
  benefitRealizationPlan: z.object({
    benefitDescription: z.string().max(4000),
    assumptions: z.string().max(4000),
    dependencies: z.string().max(4000),
    deliverable1: z.string().max(4000),
    deliverable2: z.string().max(4000),
    deliverable3: z.string().max(4000),
    nonFinancialBenefitsSummary: z.string().max(4000),
    additionalPostProjectDeliverables: z.string().max(4000),
    segmentDepartmentTrackingBenefit: z.string().max(4000),
    otherEnterpriseBenefits: z.string().max(4000)
  }),
  capitalExpenses: z.object({
    projectContingencyPct: z.coerce.number().min(0).max(100),
    withholdingTaxRatePct: z.coerce.number().min(0).max(100),
    withholdingTaxNote: z.string().max(500),
    rows: z.array(businessCaseCapitalExpenseRowSchema).max(120)
  }),
  depreciationSummary: z.object({
    endOfCurrentYearFiscal: z.string().max(40),
    rows: z.array(businessCaseDepreciationSummaryRowSchema).max(60),
    depreciationProratingGoLiveOrImplementationDate: z.string().max(40),
    depreciationProratingPeriodsRemainingInLastYear: z.string().max(120),
    notes: z.string().max(4000)
  }),
  oneTimeCosts: z.object({
    rows: z.array(businessCaseOneTimeCostRowSchema).max(60)
  }),
  pAndLImpact: z.object({
    rows: z.array(businessCasePLImpactRowSchema).max(80)
  }),
  metricsAndKpis: z.array(businessCaseMetricRowSchema).max(20),
  opportunitySummary: z.array(z.string().max(1000)).max(20)
});

const businessCaseDataDraftSchema = z.object({
  introduction: businessCaseDataSchema.shape.introduction.partial().optional(),
  projectOverview: businessCaseDataSchema.shape.projectOverview.partial().optional(),
  scopeSchedule: businessCaseDataSchema.shape.scopeSchedule.partial().optional(),
  strategyAlignment: businessCaseDataSchema.shape.strategyAlignment.partial().optional(),
  resourceRequirements: businessCaseDataSchema.shape.resourceRequirements.partial().optional(),
  userExperience: businessCaseDataSchema.shape.userExperience.partial().optional(),
  riskMitigation: businessCaseDataSchema.shape.riskMitigation.partial().optional(),
  investmentRegulationSolution: businessCaseDataSchema.shape.investmentRegulationSolution.partial().optional(),
  financialSummary: businessCaseDataSchema.shape.financialSummary.partial().optional(),
  approvals: businessCaseDataSchema.shape.approvals.partial().optional(),
  benefitRealizationPlan: businessCaseDataSchema.shape.benefitRealizationPlan.partial().optional(),
  capitalExpenses: z
    .object({
      projectContingencyPct: z.coerce.number().min(0).max(100).optional(),
      withholdingTaxRatePct: z.coerce.number().min(0).max(100).optional(),
      withholdingTaxNote: z.string().max(500).optional(),
      rows: z.array(businessCaseCapitalExpenseRowSchema.partial()).max(120).optional()
    })
    .optional(),
  depreciationSummary: z
    .object({
      endOfCurrentYearFiscal: z.string().max(40).optional(),
      rows: z.array(businessCaseDepreciationSummaryRowSchema.partial()).max(60).optional(),
      depreciationProratingGoLiveOrImplementationDate: z.string().max(40).optional(),
      depreciationProratingPeriodsRemainingInLastYear: z.string().max(120).optional(),
      notes: z.string().max(4000).optional()
    })
    .optional(),
  oneTimeCosts: z
    .object({
      rows: z.array(businessCaseOneTimeCostRowSchema.partial()).max(60).optional()
    })
    .optional(),
  pAndLImpact: z
    .object({
      rows: z.array(businessCasePLImpactRowSchema.partial()).max(80).optional()
    })
    .optional(),
  metricsAndKpis: z.array(businessCaseMetricRowSchema.partial()).max(20).optional(),
  opportunitySummary: z.array(z.string().max(1000)).max(20).optional()
});

const baseSubmissionSchema = z
  .object({
  createdByUserId: z.string().max(120).optional(),
  title: z.string().min(3).max(150),
  summary: z.string().min(10).max(530),
  businessUnit: z.string().min(2).max(80),
  opco: z.string().max(80).optional(),
  category: z.string().min(1).max(200),
  requestType: z.enum(["Placemat", "Business Case", "Special Project"]),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  riskLevel: z.enum(["Low", "Medium", "High", "Critical"]),
  regulatoryFlag: z.enum(["Y", "N"]),
  executiveSponsor: z.string().max(120).optional(),
  businessSponsor: z.string().max(120).optional(),
  businessDelegate: z.string().max(120).optional(),
  technologySponsor: z.string().max(120).optional(),
  financeSponsor: z.string().max(120).optional(),
  benefitsSponsor: z.string().max(120).optional(),
  segmentUnit: z.string().max(120).optional(),
  projectTheme: z.string().max(120).optional(),
  strategicObjective: z.string().max(120).optional(),
  specificClassificationType: z.string().max(120).optional(),
  projectClassification: z.string().max(20).optional(),
  projectType: z.string().max(40).optional(),
  enterpriseProjectTheme: z.string().max(120).optional(),
  portfolioEsc: z.string().max(160).optional(),
  sponsorName: z.string().min(2).max(120),
  sponsorEmail: z.string().email().optional(),
  sponsorContacts: sponsorContactsSchema.optional(),
  assignments: z.array(projectAssignmentSchema).max(100).optional(),
  approvalStages: z.array(projectApprovalStageSchema).max(8).optional(),
  ownerName: z.string().min(2).max(120),
  ownerEmail: z.string().email(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  targetGoLive: z.string().optional(),
  dueDate: z.string().optional(),
  benefits: z.object({
    costSaveEst: z.coerce.number().min(0),
    revenueUpliftEst: z.coerce.number().min(0),
    qualitativeBenefits: z.string().max(2000),
    financialAssumptions: z.string().max(2000).optional(),
    intangibleAssumptions: z.string().max(2000).optional()
  }),
  dependencies: z.array(z.string().min(1).max(30)).default([]),
  financialGrid: financialGridSchema.optional(),
  businessCase: businessCaseDataSchema.optional(),
  financials: z.object({
    capex: z.coerce.number().min(0),
    opex: z.coerce.number().min(0),
    oneTimeCosts: z.coerce.number().min(0),
    runRateSavings: z.coerce.number().min(0),
    paybackMonths: z.coerce.number().int().min(0),
    paybackYears: z.coerce.number().min(0).optional(),
    npv: z.coerce.number().optional(),
    irr: z.coerce.number().optional()
  })
  })
  .superRefine((data, ctx) => {
    if (isEndBeforeStart(data.startDate, data.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: DATE_ORDER_ERROR_MESSAGE
      });
    }
  });

export const createSubmissionSchema = baseSubmissionSchema;

export const draftSubmissionSchema = z
  .object({
  createdByUserId: z.string().max(120).optional(),
  title: z.string().max(150).optional(),
  summary: z.string().max(530).optional(),
  businessUnit: z.string().max(80).optional(),
  opco: z.string().max(80).optional(),
  category: z.string().max(200).optional(),
  requestType: z.enum(["Placemat", "Business Case", "Special Project"]).optional(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  riskLevel: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  regulatoryFlag: z.enum(["Y", "N"]).optional(),
  executiveSponsor: z.string().max(120).optional(),
  businessSponsor: z.string().max(120).optional(),
  businessDelegate: z.string().max(120).optional(),
  technologySponsor: z.string().max(120).optional(),
  financeSponsor: z.string().max(120).optional(),
  benefitsSponsor: z.string().max(120).optional(),
  segmentUnit: z.string().max(120).optional(),
  projectTheme: z.string().max(120).optional(),
  strategicObjective: z.string().max(120).optional(),
  specificClassificationType: z.string().max(120).optional(),
  projectClassification: z.string().max(20).optional(),
  projectType: z.string().max(40).optional(),
  enterpriseProjectTheme: z.string().max(120).optional(),
  portfolioEsc: z.string().max(160).optional(),
  sponsorName: z.string().max(120).optional(),
  sponsorEmail: z.string().email().optional(),
  sponsorContacts: sponsorContactsSchema.optional(),
  assignments: z.array(projectAssignmentSchema).max(100).optional(),
  approvalStages: z.array(projectApprovalStageSchema).max(8).optional(),
  ownerName: z.string().max(120).optional(),
  ownerEmail: z.string().email().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  targetGoLive: z.string().optional(),
  dueDate: z.string().optional(),
  benefits: z
    .object({
      costSaveEst: z.coerce.number().min(0).optional(),
      revenueUpliftEst: z.coerce.number().min(0).optional(),
      qualitativeBenefits: z.string().max(2000).optional(),
      financialAssumptions: z.string().max(2000).optional(),
      intangibleAssumptions: z.string().max(2000).optional()
    })
    .optional(),
  dependencies: z.array(z.string().min(1).max(30)).optional(),
  financialGrid: financialGridSchema.partial().optional(),
  businessCase: businessCaseDataDraftSchema.optional(),
  stage: stageEnum.optional(),
  financials: z
    .object({
      capex: z.coerce.number().min(0).optional(),
      opex: z.coerce.number().min(0).optional(),
      oneTimeCosts: z.coerce.number().min(0).optional(),
      runRateSavings: z.coerce.number().min(0).optional(),
      paybackMonths: z.coerce.number().int().min(0).optional(),
      paybackYears: z.coerce.number().min(0).optional(),
      npv: z.coerce.number().optional(),
      irr: z.coerce.number().optional()
    })
    .optional(),
  workflow: z
    .object({
      entityType: workflowEntityTypeEnum.optional(),
      lifecycleStatus: workflowLifecycleStatusEnum.optional(),
      sponsorDecision: decisionEnum.optional(),
      pgoDecision: decisionEnum.optional(),
      financeDecision: decisionEnum.optional(),
      spoDecision: decisionEnum.optional(),
      fundingStatus: z.enum(["Not Requested", "Requested", "Funded", "Live"]).optional(),
      lastSavedAt: z.string().datetime().optional(),
      lockedAt: z.string().datetime().optional(),
      lockReason: z.string().max(2000).optional()
    })
    .optional(),
    status: statusEnum.optional()
  })
  .superRefine((data, ctx) => {
    if (isEndBeforeStart(data.startDate, data.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: DATE_ORDER_ERROR_MESSAGE
      });
    }
  });

export const workflowActionSchema = z.object({
  action: z.enum([
    "SEND_TO_SPONSOR",
    "SPONSOR_APPROVE",
    "SPONSOR_REJECT",
    "SPONSOR_RETURN",
    "PGO_APPROVE",
    "PGO_REJECT",
    "FINANCE_APPROVE",
    "FINANCE_REJECT",
    "SPO_APPROVE",
    "SPO_REJECT",
    "SUBMIT_FUNDING_REQUEST",
    "MARK_FUNDED",
    "MARK_LIVE",
    "RAISE_CHANGE_REQUEST",
    "DEFER",
    "CANCEL"
  ])
});

export type CreateSubmissionPayload = z.infer<typeof createSubmissionSchema>;
export type DraftSubmissionPayload = z.infer<typeof draftSubmissionSchema>;
