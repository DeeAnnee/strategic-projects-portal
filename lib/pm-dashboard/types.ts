import type { ProjectChangeLogPayload } from "@/lib/change-management/types";

export type PmProjectStage = "PROPOSAL" | "FUNDING_REQUEST" | "DELIVERY" | "CLOSED";
export type PmProjectHealth = "Green" | "Amber" | "Red";
export type PmMilestoneStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "BLOCKED";
export type PmTaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "BLOCKED";
export type PmRiskSeverity = "Low" | "Medium" | "High" | "Critical";
export type PmRiskProbability = "Low" | "Medium" | "High";
export type PmImpactArea = "Schedule" | "Cost" | "Scope" | "Compliance" | "Technology";
export type PmRiskStatus = "OPEN" | "MITIGATED" | "CLOSED";
export type PmIssueStatus = "OPEN" | "IN_PROGRESS" | "CLOSED";

export const SLA_EVENT_TYPES = [
  "SUBMITTED",
  "SPONSOR_REVIEW_START",
  "SPONSOR_APPROVED",
  "PGO_START",
  "PGO_DONE",
  "FGO_START",
  "FGO_DONE",
  "SPO_START",
  "SPO_DECISION",
  "FR_SUBMITTED",
  "FR_APPROVED",
  "PM_ASSIGNED",
  "DELIVERY_START",
  "DELIVERY_DONE"
] as const;

export type PmSlaEventType = (typeof SLA_EVENT_TYPES)[number];

export type PmDashboardProject = {
  projectId: string;
  title: string;
  description: string;
  stage: PmProjectStage;
  status: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  health: PmProjectHealth;
  startDate: string;
  endDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  baselineStartDate: string;
  baselineEndDate: string;
  percentComplete: number;
  budgetRequested: number;
  budgetApproved: number;
  spendToDate: number;
  benefitsTargetAnnual: number;
  benefitsTargetTotal: number;
  benefitsRealizedToDate: number;
  businessSponsor: string;
  businessDelegate: string;
  financeSponsor: string;
  technologySponsor: string;
  benefitsSponsor: string;
  projectManager: string;
  projectManagerEmail: string;
  segmentUnit: string;
  businessUnit: string;
  lastUpdatedAt: string;
  latestChangeStatus?: string;
  changeRiskIndicator?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "NONE";
  hasOpenChangeRequest?: boolean;
  hasBudgetImpact?: boolean;
  hasScheduleImpact?: boolean;
  hasRiskEscalation?: boolean;
};

export type PmMilestone = {
  id: string;
  projectId: string;
  name: string;
  plannedDate: string;
  forecastDate: string;
  actualDate?: string;
  status: PmMilestoneStatus;
  ownerUserId: string;
};

export type PmTask = {
  id: string;
  projectId: string;
  name: string;
  status: PmTaskStatus;
  ownerUserId: string;
  ownerName: string;
  dueDate: string;
  completedAt?: string;
  createdAt: string;
};

export type PmRisk = {
  id: string;
  projectId: string;
  title: string;
  severity: PmRiskSeverity;
  probability: PmRiskProbability;
  impactArea: PmImpactArea;
  mitigation: string;
  ownerUserId: string;
  ownerName: string;
  status: PmRiskStatus;
  createdAt: string;
};

export type PmIssue = {
  id: string;
  projectId: string;
  title: string;
  severity: PmRiskSeverity;
  ownerUserId: string;
  ownerName: string;
  status: PmIssueStatus;
  openedAt: string;
  closedAt?: string;
};

export type PmSlaEvent = {
  id: string;
  projectId: string;
  eventType: PmSlaEventType;
  timestamp: string;
};

export type PmDashboardFilters = {
  search: string;
  stage: string;
  status: string;
  health: string;
  sponsor: string;
  projectManager: string;
  businessUnit: string;
  dateFrom: string;
  dateTo: string;
};

export type PmDashboardDataset = {
  projects: PmDashboardProject[];
  milestones: PmMilestone[];
  tasks: PmTask[];
  risks: PmRisk[];
  issues: PmIssue[];
  slaEvents: PmSlaEvent[];
};

export type PmKpis = {
  totalActiveProjects: number;
  onTrackPct: number;
  atRiskCount: number;
  slaCompliancePct: number;
  avgCycleTimeDays: number;
  overdueMilestones: number;
  overdueTasks: number;
};

export type PmChangeDashboardWidgets = {
  projectsWithActiveChanges: number;
  changeRequestsByStatus: Array<{ status: string; count: number }>;
  totalBudgetImpact: number;
  scheduleImpactTrend: Array<{ month: string; value: number }>;
  avgChangeApprovalTimeHours: number;
  projectsWithMoreThan3Changes: Array<{ projectId: string; changes: number }>;
};

export type PmAttentionRow = {
  projectId: string;
  project: string;
  projectManager: string;
  stage: PmProjectStage;
  health: PmProjectHealth;
  slaDays: number;
  nextMilestone: string;
  daysOverdue: number;
  action: string;
};

export type PmSummaryResponse = {
  lastRefreshedAt: string;
  kpis: PmKpis;
  changeWidgets: PmChangeDashboardWidgets;
  filters: {
    stages: string[];
    statuses: string[];
    health: string[];
    sponsors: string[];
    projectManagers: string[];
    businessUnits: string[];
  };
  attentionRequired: PmAttentionRow[];
};

export type PmProjectsResponse = {
  page: number;
  pageSize: number;
  total: number;
  data: Array<
    PmDashboardProject & {
      overdueTaskCount: number;
      overdueMilestoneCount: number;
      nextMilestone: string;
      slaCycleDays: number;
      roiProxy: number;
      budgetVariance: number;
    }
  >;
};

export type PmStageHealthChartResponse = {
  byStage: Array<{ stage: PmProjectStage; count: number }>;
  byHealth: Array<{ health: PmProjectHealth; count: number }>;
  statusTrend: Array<{ month: string; totals: Record<string, number> }>;
  bottlenecks: Array<{ step: string; avgDays: number }>;
};

export type PmSlaChartResponse = {
  agingBuckets: Array<{ bucket: string; count: number }>;
  complianceTrend: Array<{ month: string; compliancePct: number }>;
  cycleDistribution: Array<{ label: string; value: number }>;
  throughput: Array<{ month: string; approvalsCompleted: number }>;
  stepDurations: Array<{ step: string; avgDays: number }>;
};

export type PmScheduleChartResponse = {
  timeline: Array<{
    projectId: string;
    project: string;
    plannedStart: string;
    plannedEnd: string;
    forecastStart: string;
    forecastEnd: string;
    varianceDays: number;
    health: PmProjectHealth;
  }>;
  milestoneBurndown: Array<{ month: string; planned: number; completed: number }>;
  milestones: Array<{
    id: string;
    projectId: string;
    project: string;
    name: string;
    plannedDate: string;
    forecastDate: string;
    actualDate?: string;
    status: PmMilestoneStatus;
    daysOverdue: number;
  }>;
};

export type PmRiskChartsResponse = {
  heatmap: Array<{ probability: PmRiskProbability; impactArea: PmImpactArea; count: number }>;
  criticalItems: Array<{
    id: string;
    projectId: string;
    project: string;
    type: "Risk" | "Issue";
    title: string;
    severity: PmRiskSeverity;
    owner: string;
    status: string;
    ageDays: number;
  }>;
  trend: Array<{ month: string; opened: number; closed: number }>;
};

export type PmResourcesChartsResponse = {
  workload14: Array<{ owner: string; tasksDue: number }>;
  workload30: Array<{ owner: string; tasksDue: number }>;
  capacity: Array<{ owner: string; assignedProjects: number; overdueActions: number }>;
  table: Array<{ owner: string; assignedProjects: number; openTasks: number; overdueTasks: number }>;
};

export type PmDrilldownResponse = {
  project: PmDashboardProject;
  schedule: {
    varianceDays: number;
    onTimeMilestoneRate: number;
    upcomingMilestones: PmScheduleChartResponse["milestones"];
  };
  sla: {
    sponsorDays: number;
    pgoDays: number;
    fgoDays: number;
    spoDays: number;
    cycleDays: number;
    compliance: boolean;
  };
  tasks: PmTask[];
  risks: PmRisk[];
  issues: PmIssue[];
  milestones: PmMilestone[];
  slaTimeline: PmSlaEvent[];
  approvals: Array<{ stage: string; status: string; decidedAt?: string; comment?: string }>;
  auditTrail: Array<{ action: string; stage: string; status: string; createdAt: string; note: string }>;
  changeLog: ProjectChangeLogPayload;
  financials: {
    budgetRequested: number;
    budgetApproved: number;
    spendToDate: number;
    forecastToComplete: number;
    benefitsTargetTotal: number;
    benefitsRealizedToDate: number;
    roiProxy: number;
  };
};
