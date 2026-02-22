export type ProjectCategory = "Technology" | "Premise" | "Other" | (string & {});
export type RequestType = "Placemat" | "Business Case" | "Special Project";
export type PriorityLevel = "Low" | "Medium" | "High" | "Critical";
export type RiskLevel = "Low" | "Medium" | "High" | "Critical";
export type RegulatoryFlag = "Y" | "N";

export type CanonicalProjectStage = "PROPOSAL" | "FUNDING" | "LIVE";
export type LegacyProjectStage =
  | "Placemat Proposal"
  | "Sponsor Approval"
  | "PGO & Finance Review"
  | "SPO Committee Review"
  | "Funding Request"
  | "Live Project"
  | "Change Request";
export type ProjectStage = CanonicalProjectStage | LegacyProjectStage;

export type CanonicalProjectStatus =
  | "DRAFT"
  | "SPONSOR_REVIEW"
  | "PGO_FGO_REVIEW"
  | "SPO_REVIEW"
  | "REJECTED"
  | "APPROVED"
  | "ACTIVE"
  | "CHANGE_REVIEW";
export type LegacyProjectStatus =
  | "Draft"
  | "Submitted"
  | "Sent for Approval"
  | "At SPO Review"
  | "Approved"
  | "Rejected"
  | "Returned to Submitter"
  | "Deferred"
  | "Cancelled";
export type ProjectStatus = CanonicalProjectStatus | LegacyProjectStatus;

export type WorkflowEntityType = "PROPOSAL" | "FUNDING_REQUEST";
export type ProposalWorkflowStatus =
  | "DRAFT"
  | "AT_SPONSOR_REVIEW"
  | "AT_PGO_FGO_REVIEW"
  | "AT_SPO_REVIEW"
  | "SPO_DECISION_APPROVED"
  | "SPO_DECISION_REJECTED"
  | "SPO_DECISION_DEFERRED";
export type FundingWorkflowStatus =
  | "FR_DRAFT"
  | "FR_AT_SPONSOR_APPROVALS"
  | "FR_AT_PGO_FGO_REVIEW"
  | "FR_APPROVED"
  | "FR_REJECTED";
export type WorkflowLifecycleStatus =
  | ProposalWorkflowStatus
  | FundingWorkflowStatus
  | "CLOSED"
  | "ARCHIVED";

export type Decision = "Pending" | "Approved" | "Rejected" | "Need More Info" | "Returned to Submitter";
export type FundingStatus = "Not Requested" | "Requested" | "Funded" | "Live";
export type ApprovalStageCode = "BUSINESS" | "TECHNOLOGY" | "FINANCE" | "BENEFITS" | "PROJECT_MANAGER";
export type ApprovalStageStatus = "PENDING" | "APPROVED" | "REJECTED" | "NEED_MORE_INFO";
export type ApprovalActingAs = "SPONSOR" | "DELEGATE";
export type WorkflowApprovalRoleContext =
  | "BUSINESS_SPONSOR"
  | "BUSINESS_DELEGATE"
  | "FINANCE_SPONSOR"
  | "TECH_SPONSOR"
  | "BENEFITS_SPONSOR"
  | "PROJECT_MANAGER";
export type ApprovalRequestEntityType = "PROPOSAL" | "FUNDING_REQUEST" | "PM_ASSIGNMENT";
export type ApprovalRequestStageContext = "PROPOSAL" | "FUNDING" | "PM_ASSIGNMENT";
export type ApprovalRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "NEED_MORE_INFO"
  | "CANCELLED";

export type ProjectPersonRef = {
  azureObjectId: string;
  displayName: string;
  email: string;
  jobTitle: string;
  photoUrl?: string;
};

export type SponsorContacts = {
  businessSponsor?: ProjectPersonRef | null;
  businessDelegate?: ProjectPersonRef | null;
  technologySponsor?: ProjectPersonRef | null;
  financeSponsor?: ProjectPersonRef | null;
  benefitsSponsor?: ProjectPersonRef | null;
};

export type ProjectAssignment = {
  id: string;
  projectId: string;
  userId?: string;
  userEmail?: string;
  userAzureObjectId?: string;
  assignmentType: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ProjectApprovalStageRecord = {
  id: string;
  stage: ApprovalStageCode;
  status: ApprovalStageStatus;
  decidedByUserId?: string;
  actingAs?: ApprovalActingAs;
  comment?: string;
  decidedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type FinancialDetails = {
  capex: number;
  opex: number;
  oneTimeCosts: number;
  runRateSavings: number;
  paybackMonths: number;
  paybackYears?: number;
  npv?: number;
  irr?: number;
};

export type BenefitsDetails = {
  costSaveEst: number;
  revenueUpliftEst: number;
  qualitativeBenefits: string;
  financialAssumptions?: string;
  intangibleAssumptions?: string;
};

export type InvestmentCell = {
  priorYears: number;
  currentFiscal: number;
  future: number;
};

export type FinancialGrid = {
  commencementFiscalYear: number;
  investment: {
    hardware: InvestmentCell;
    software: InvestmentCell;
    consultancyVendor: InvestmentCell;
    premisesRealEstate: InvestmentCell;
    otherCapital: InvestmentCell;
    expenses: InvestmentCell;
  };
  incremental: {
    years: number[];
    revenue: number[];
    savedCosts: number[];
    addlOperatingCosts: number[];
  };
};

export type BusinessCaseMetricRow = {
  keyMetricCategory: string;
  keyMetric: string;
  targetValue: string;
  priorFys: string;
  f2026: string;
  f2027: string;
  f2028: string;
  f2029: string;
  f2030: string;
};

export type BusinessCaseTechnologyApplicationResourceRow = {
  id: string;
  impactedApplication: string;
  availabilityApplicationTier: string;
  strategicOrNonStrategic: string;
  rationaleForCompletingWork: string;
  introducesNewApplication: string;
  decommissionOpportunity: string;
};

export type BusinessCaseHumanResourceRow = {
  id: string;
  roleDescription: string;
  responsibilities: string;
  resourceType: string;
  payGrade: string;
  resourceName: string;
  comments: string;
  capexOpex: string;
  resourceStartDate: string;
  resourceEndDate: string;
  hiringRequired: string;
  averageAllocationPct: string;
};

export type BusinessCaseCapitalExpenseRow = {
  id: string;
  group: string;
  label: string;
  isTotal?: boolean;
  quantity: number;
  unitCost: number;
  totalCost: number;
  comments: string;
  annualDepreciation: number;
  priorFys: number;
  f2025Q1: number;
  f2025Q2: number;
  f2025Q3: number;
  f2025Q4: number;
  f2025Plan: number;
  f2026: number;
  f2027: number;
  f2028: number;
  f2029: number;
  f2030: number;
};

export type BusinessCaseDepreciationSummaryRow = {
  id: string;
  phase: string;
  category: string;
  capexPrepaidCategory: string;
  phaseStartDate: string;
  phaseEndDate: string;
  usefulLifeYears: number;
  totalProjectCost: number;
  projectCostForPhase: number;
  annualDepreciation: number;
  priorFys: number;
  currentYear: number;
  yearPlus1: number;
  yearPlus2: number;
  yearPlus3: number;
  yearPlus4: number;
  yearPlus5: number;
  total: number;
};

export type BusinessCaseOneTimeCostRow = {
  id: string;
  item: string;
  comments: string;
  projectTotal: number;
  priorFys: number;
  currentYearSpend: number;
  currentYearPlan: number;
  yearPlus1: number;
  yearPlus2: number;
  yearPlus3: number;
  yearPlus4: number;
  yearPlus5: number;
  total: number;
};

export type BusinessCasePLImpactRow = {
  id: string;
  group: string;
  label: string;
  isTotal?: boolean;
  priorFys: number;
  currentYear: number;
  yearPlus1: number;
  yearPlus2: number;
  yearPlus3: number;
  yearPlus4: number;
  yearPlus5: number;
  total: number;
};

export type BusinessCaseFinancialSummaryRow = {
  priorFys: number;
  f2025: number;
  f2026: number;
  f2027: number;
  f2028: number;
  f2029: number;
  f2030: number;
};

export type BusinessCaseData = {
  introduction: {
    projectInitiativeName: string;
    fundingSource: string;
    fundingType: string;
    ndaProject: string;
    projectCategory: string;
    projectImportance: string;
    projectComplexity: string;
    businessSponsor: string;
    businessDelegate: string;
    technologySponsor: string;
    financeSponsor: string;
    benefitsSponsor: string;
    inPlanForCurrentYear: string;
    currentYear: string;
    endOfFiscalInCurrentYear: string;
    currentYearSpendVsPlan: string;
    totalCostCapexOneTime: string;
    npv5Year: string;
    irr5Year: string;
    paybackYears: string;
    fteUpDown: string;
    annualOngoingCostExcludingDepreciation: string;
  };
  projectOverview: {
    projectDescription: string;
    opportunityStatement: string;
  };
  scopeSchedule: {
    start: string;
    businessCaseApproval: string;
    goLive: string;
    benefitRealizationStart: string;
    closure: string;
  };
  strategyAlignment: {
    enterpriseStrategyAlignment: string;
    keyDependencies: string;
  };
  resourceRequirements: {
    internalFteRequirements: string;
    externalSupportRequired: string;
    hiringRequired: string;
    additionalResourceDetails: string;
    humanResources: BusinessCaseHumanResourceRow[];
    technologyApplicationResources: BusinessCaseTechnologyApplicationResourceRow[];
  };
  userExperience: {
    userExperienceImpact: string;
    userExperienceQuadrant: string;
    impactDescription: string;
  };
  riskMitigation: {
    riskAssessmentRequired: string;
    ciraReferenceName: string;
    ciraReferenceNumber: string;
    highMediumInherentRisk: string;
  };
  investmentRegulationSolution: {
    regulatoryGoverningBody: string;
    specificRegulationNameOrDeficiencyId: string;
    implementationDueDate: string;
    impactedApplication: string;
    availabilityApplicationTier: string;
    strategicOrNonStrategic: string;
    rationaleForCompletingWork: string;
    introducesNewApplication: string;
    decommissionOpportunity: string;
  };
  financialSummary: {
    financialImpactsIncludingWorkforceOperatingCostAndPL: string;
    restructuringHrBauFunded: BusinessCaseFinancialSummaryRow;
  };
  approvals: {
    requiredStakeholderApprovals: string;
  };
  benefitRealizationPlan: {
    benefitDescription: string;
    assumptions: string;
    dependencies: string;
    deliverable1: string;
    deliverable2: string;
    deliverable3: string;
    nonFinancialBenefitsSummary: string;
    additionalPostProjectDeliverables: string;
    segmentDepartmentTrackingBenefit: string;
    otherEnterpriseBenefits: string;
  };
  capitalExpenses: {
    projectContingencyPct: number;
    withholdingTaxRatePct: number;
    withholdingTaxNote: string;
    rows: BusinessCaseCapitalExpenseRow[];
  };
  depreciationSummary: {
    endOfCurrentYearFiscal: string;
    rows: BusinessCaseDepreciationSummaryRow[];
    depreciationProratingGoLiveOrImplementationDate: string;
    depreciationProratingPeriodsRemainingInLastYear: string;
    notes: string;
  };
  oneTimeCosts: {
    rows: BusinessCaseOneTimeCostRow[];
  };
  pAndLImpact: {
    rows: BusinessCasePLImpactRow[];
  };
  metricsAndKpis: BusinessCaseMetricRow[];
  opportunitySummary: string[];
};

export type WorkflowState = {
  entityType: WorkflowEntityType;
  lifecycleStatus: WorkflowLifecycleStatus;
  sponsorDecision: Decision;
  pgoDecision: Decision;
  financeDecision: Decision;
  spoDecision: Decision;
  fundingStatus: FundingStatus;
  lastSavedAt?: string;
  lockedAt?: string;
  lockReason?: string;
};

export type ApprovalRequestRecord = {
  id: string;
  entityType: ApprovalRequestEntityType;
  stageContext: ApprovalRequestStageContext;
  entityId: string;
  approverUserId?: string;
  approverAzureObjectId?: string;
  approverName: string;
  approverEmail: string;
  roleContext: WorkflowApprovalRoleContext;
  status: ApprovalRequestStatus;
  createdByUserId?: string;
  requestedAt: string;
  decidedAt?: string;
  comment?: string;
  createdAt: string;
  updatedAt: string;
};

export type SubmissionAuditEntry = {
  id: string;
  action: "CREATED" | "UPDATED" | "REASSIGNED_SPONSOR" | WorkflowAction | (string & {});
  stage: ProjectStage;
  status: ProjectStatus;
  workflow: WorkflowState;
  note: string;
  actorName?: string;
  actorEmail?: string;
  createdAt: string;
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export type ProjectSubmission = {
  id: string;
  createdByUserId?: string;
  title: string;
  summary: string;
  businessUnit: string;
  opco?: string;
  category: ProjectCategory;
  requestType: RequestType;
  priority: PriorityLevel;
  riskLevel: RiskLevel;
  regulatoryFlag: RegulatoryFlag;
  executiveSponsor?: string;
  businessSponsor?: string;
  businessDelegate?: string;
  technologySponsor?: string;
  financeSponsor?: string;
  benefitsSponsor?: string;
  segmentUnit?: string;
  projectTheme?: string;
  strategicObjective?: string;
  specificClassificationType?: string;
  projectClassification?: string;
  projectType?: string;
  enterpriseProjectTheme?: string;
  portfolioEsc?: string;
  committeeDecision?: "APPROVED" | "REJECTED" | "DEFERRED" | null;
  sponsorName: string;
  sponsorEmail?: string;
  sponsorContacts?: SponsorContacts;
  assignments?: ProjectAssignment[];
  approvalStages?: ProjectApprovalStageRecord[];
  ownerName: string;
  ownerEmail: string;
  startDate?: string;
  endDate?: string;
  targetGoLive?: string;
  status: ProjectStatus;
  stage: ProjectStage;
  workflow: WorkflowState;
  dueDate?: string;
  benefits: BenefitsDetails;
  dependencies: string[];
  financialGrid?: FinancialGrid;
  businessCase?: BusinessCaseData;
  financials: FinancialDetails;
  createdAt: string;
  updatedAt: string;
  auditTrail?: SubmissionAuditEntry[];
};

export type CreateSubmissionInput = Omit<
  ProjectSubmission,
  "id" | "status" | "stage" | "createdAt" | "updatedAt" | "workflow"
>;

export type SubmissionPatch = Omit<
  Partial<CreateSubmissionInput>,
  "financials" | "benefits" | "financialGrid" | "businessCase"
> & {
  financials?: Partial<FinancialDetails>;
  benefits?: Partial<BenefitsDetails>;
  financialGrid?: Partial<FinancialGrid>;
  businessCase?: DeepPartial<BusinessCaseData>;
  status?: ProjectStatus;
  stage?: ProjectStage;
  workflow?: Partial<WorkflowState>;
};

export type WorkflowAction =
  | "SEND_TO_SPONSOR"
  | "SPONSOR_APPROVE"
  | "SPONSOR_REJECT"
  | "SPONSOR_RETURN"
  | "PGO_APPROVE"
  | "PGO_REJECT"
  | "FINANCE_APPROVE"
  | "FINANCE_REJECT"
  | "SPO_APPROVE"
  | "SPO_REJECT"
  | "SUBMIT_FUNDING_REQUEST"
  | "MARK_FUNDED"
  | "MARK_LIVE"
  | "RAISE_CHANGE_REQUEST"
  | "DEFER"
  | "CANCEL";
