import { promises as fs } from "node:fs";
import path from "node:path";

import { filterSubmissionsByAccess } from "@/lib/auth/project-access";
import type { RbacUser } from "@/lib/auth/rbac";
import {
  getChangeManagementAnalytics,
  getProjectChangeIndicatorMap,
  getProjectChangeLog
} from "@/lib/change-management/service";
import type { ProjectSubmission } from "@/lib/submissions/types";
import { listSubmissions } from "@/lib/submissions/store";
import type {
  PmAttentionRow,
  PmDashboardDataset,
  PmDashboardFilters,
  PmDashboardProject,
  PmDrilldownResponse,
  PmIssue,
  PmKpis,
  PmMilestone,
  PmProjectsResponse,
  PmResourcesChartsResponse,
  PmRisk,
  PmRiskChartsResponse,
  PmScheduleChartResponse,
  PmSlaChartResponse,
  PmSlaEvent,
  PmStageHealthChartResponse,
  PmSummaryResponse,
  PmTask
} from "@/lib/pm-dashboard/types";

const pmDashboardStoreFile = path.join(process.cwd(), "data", "pm-dashboard.json");
const CACHE_TTL_MS = 20_000;

const allLabel = "All";

export const defaultPmFilters: PmDashboardFilters = {
  search: "",
  stage: allLabel,
  status: allLabel,
  health: allLabel,
  sponsor: allLabel,
  projectManager: allLabel,
  businessUnit: allLabel,
  dateFrom: "",
  dateTo: ""
};

type PmDashboardSeedData = {
  milestones?: PmMilestone[];
  tasks?: PmTask[];
  risks?: PmRisk[];
  issues?: PmIssue[];
  slaEvents?: PmSlaEvent[];
};

type DashboardContext = {
  lastRefreshedAt: string;
  submissionsByProject: Map<string, ProjectSubmission>;
  projects: PmDashboardProject[];
  milestones: PmMilestone[];
  tasks: PmTask[];
  risks: PmRisk[];
  issues: PmIssue[];
  slaEvents: PmSlaEvent[];
  changeIndicators: Record<
    string,
    {
      latestChangeStatus: string;
      changeRiskIndicator: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "NONE";
      hasOpenChangeRequest: boolean;
      hasBudgetImpact: boolean;
      hasScheduleImpact: boolean;
      hasRiskEscalation: boolean;
      cumulativeBudgetDelta: number;
      cumulativeScheduleImpactDays: number;
    }
  >;
  changeAnalytics: Awaited<ReturnType<typeof getChangeManagementAnalytics>>;
};

type ProjectSlaStats = {
  sponsorDays: number;
  pgoDays: number;
  fgoDays: number;
  spoDays: number;
  cycleDays: number;
  sponsorPending: boolean;
  pgoPending: boolean;
  fgoPending: boolean;
  spoPending: boolean;
};

type CacheEntry = {
  expiresAt: number;
  value: DashboardContext;
};

const dashboardCache = new Map<string, CacheEntry>();

const SLA_TARGETS = {
  sponsor: 3,
  pgo: 4,
  fgo: 4,
  spo: 5,
  cycle: 20
};

const priorityOrder = ["Low", "Medium", "High", "Critical"] as const;
const riskSeverityOrder = ["Low", "Medium", "High", "Critical"] as const;
const riskProbabilityOrder = ["Low", "Medium", "High"] as const;
const impactAreaOrder = ["Schedule", "Cost", "Scope", "Compliance", "Technology"] as const;

const toIsoDate = (value?: string | null, fallback?: Date) => {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return (fallback ?? new Date()).toISOString().slice(0, 10);
};

const toIsoDateTime = (value?: string | null, fallback?: Date) => {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return (fallback ?? new Date()).toISOString();
};

const addDays = (isoDate: string, days: number) => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const addDaysDateTime = (isoDateTime: string, days: number) => {
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString();
};

const daysBetween = (from: string, to: string) => {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return 0;
  }
  return (toMs - fromMs) / 86_400_000;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const seededPct = (seed: number, step = 1) => {
  const normalized = ((seed * 9301 + 49297 * step) % 233280) / 233280;
  return normalized;
};

const pick = <T>(items: readonly T[], seed: number, step = 1): T => {
  if (items.length === 0) {
    throw new Error("Cannot pick from empty collection.");
  }
  const idx = Math.floor(seededPct(seed, step) * items.length) % items.length;
  return items[idx] as T;
};

const toProjectStage = (submission: ProjectSubmission): PmDashboardProject["stage"] => {
  if (submission.status === "Cancelled") {
    return "CLOSED";
  }

  if (submission.stage === "Funding Request") {
    return "FUNDING_REQUEST";
  }

  if (submission.stage === "Live Project" || submission.stage === "Change Request") {
    if (submission.status === "Approved" && submission.workflow.fundingStatus === "Live") {
      return "CLOSED";
    }
    return "DELIVERY";
  }

  return "PROPOSAL";
};

const toPercentComplete = (submission: ProjectSubmission, stage: PmDashboardProject["stage"]) => {
  if (stage === "CLOSED") {
    return 100;
  }

  if (stage === "DELIVERY") {
    if (submission.workflow.fundingStatus === "Live") {
      return 96;
    }
    if (submission.status === "Approved") {
      return 84;
    }
    return 74;
  }

  if (stage === "FUNDING_REQUEST") {
    if (submission.status === "Approved") return 78;
    if (submission.status === "Sent for Approval") return 69;
    return 62;
  }

  if (submission.stage === "SPO Committee Review") return 55;
  if (submission.stage === "PGO & Finance Review") return 45;
  if (submission.stage === "Sponsor Approval") return 34;
  if (submission.status === "Submitted" || submission.status === "Sent for Approval") return 24;
  return 14;
};

const toProjectHealth = (
  submission: ProjectSubmission,
  stage: PmDashboardProject["stage"],
  percentComplete: number,
  varianceDays: number,
  budgetVariancePct: number
): PmDashboardProject["health"] => {
  if (submission.status === "Rejected" || submission.status === "Cancelled") {
    return "Red";
  }

  if (varianceDays > 21 || budgetVariancePct > 25) {
    return "Red";
  }

  if (
    submission.stage === "Sponsor Approval" ||
    submission.stage === "PGO & Finance Review" ||
    submission.stage === "SPO Committee Review"
  ) {
    return "Amber";
  }

  if (stage === "FUNDING_REQUEST" && submission.status !== "Approved") {
    return "Amber";
  }

  if (percentComplete < 35) {
    return "Amber";
  }

  return "Green";
};

const readPmDashboardSeed = async (): Promise<PmDashboardSeedData> => {
  try {
    const raw = await fs.readFile(pmDashboardStoreFile, "utf8");
    const parsed = JSON.parse(raw) as PmDashboardSeedData;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const mergeById = <T extends { id: string; projectId: string }>(
  generatedRows: T[],
  seededRows: T[] | undefined,
  allowedProjectIds: Set<string>
): T[] => {
  const rows = [...generatedRows];
  const map = new Map(rows.map((row) => [row.id, row]));

  (seededRows ?? []).forEach((seeded) => {
    if (!allowedProjectIds.has(seeded.projectId)) {
      return;
    }
    map.set(seeded.id, seeded);
  });

  return Array.from(map.values());
};

const buildSyntheticMilestones = (project: PmDashboardProject, seed: number): PmMilestone[] => {
  const anchorStart = project.baselineStartDate;
  const anchorEnd = project.baselineEndDate;
  const totalPlanDays = Math.max(30, Math.round(daysBetween(anchorStart, anchorEnd)));
  const weights = [0.1, 0.3, 0.55, 0.78, 1];
  const names = [
    "Initiation Complete",
    "Sponsor & Governance Complete",
    "Build/Configuration Complete",
    "UAT & Readiness",
    "Go-Live"
  ];

  return names.map((name, index) => {
    const plannedOffset = Math.round(totalPlanDays * weights[index]);
    const plannedDate = addDays(anchorStart, plannedOffset);
    const slip = Math.round((seededPct(seed, index + 3) - 0.35) * 24);
    const forecastDate = addDays(plannedDate, slip);
    const completionThreshold = ((index + 1) / names.length) * 100;
    const isDone = project.percentComplete >= completionThreshold;
    const now = new Date().toISOString().slice(0, 10);

    let status: PmMilestone["status"] = "NOT_STARTED";
    if (isDone) {
      status = "DONE";
    } else if (daysBetween(plannedDate, now) > 10 && project.health === "Red") {
      status = "BLOCKED";
    } else if (project.percentComplete >= completionThreshold - 18) {
      status = "IN_PROGRESS";
    }

    return {
      id: `${project.projectId}-ms-${index + 1}`,
      projectId: project.projectId,
      name,
      plannedDate,
      forecastDate,
      actualDate: isDone ? addDays(forecastDate, Math.round((seededPct(seed, index + 10) - 0.5) * 6)) : undefined,
      status,
      ownerUserId: project.projectManagerEmail || project.projectManager
    };
  });
};

const buildSyntheticTasks = (project: PmDashboardProject, seed: number): PmTask[] => {
  const names = [
    "Finalize scope and change controls",
    "Complete architecture and solution design",
    "Implement and configure release scope",
    "Run integrated testing and defect closure",
    "Execute deployment and cutover",
    "Confirm benefits tracking baseline"
  ];

  const totalPlanDays = Math.max(35, Math.round(daysBetween(project.startDate, project.endDate)));
  const completedCount = Math.floor((project.percentComplete / 100) * names.length);

  return names.map((name, index) => {
    const due = addDays(project.startDate, Math.round((totalPlanDays / names.length) * (index + 1)));
    const createdAt = addDaysDateTime(`${project.startDate}T09:00:00.000Z`, index * 9);
    const isDone = index < completedCount;
    const isInProgress = !isDone && index === completedCount;
    const status: PmTask["status"] = isDone ? "DONE" : isInProgress ? "IN_PROGRESS" : "NOT_STARTED";

    const dueDelta = daysBetween(due, new Date().toISOString().slice(0, 10));
    const blocked = !isDone && dueDelta > 14 && project.health === "Red";

    return {
      id: `${project.projectId}-task-${index + 1}`,
      projectId: project.projectId,
      name,
      status: blocked ? "BLOCKED" : status,
      ownerUserId: project.projectManagerEmail || project.projectManager,
      ownerName: project.projectManager,
      dueDate: due,
      completedAt: isDone ? addDaysDateTime(`${due}T16:00:00.000Z`, Math.round((seededPct(seed, index + 17) - 0.5) * 6)) : undefined,
      createdAt
    };
  });
};

const buildSyntheticRisks = (project: PmDashboardProject, seed: number): PmRisk[] => {
  const riskCount = project.health === "Red" ? 3 : project.health === "Amber" ? 2 : 1;
  const titles = [
    "Dependency delivery slippage",
    "Integration scope growth",
    "Benefits measurement readiness",
    "Environment stability risk"
  ];

  return Array.from({ length: riskCount }).map((_, index) => {
    const severity =
      project.health === "Red"
        ? pick(riskSeverityOrder, seed + index, 3)
        : project.health === "Amber"
          ? pick(["Medium", "High", "Critical"] as const, seed + index, 4)
          : pick(["Low", "Medium", "High"] as const, seed + index, 4);

    return {
      id: `${project.projectId}-risk-${index + 1}`,
      projectId: project.projectId,
      title: titles[index % titles.length],
      severity,
      probability: pick(riskProbabilityOrder, seed + index, 11),
      impactArea: pick(impactAreaOrder, seed + index, 13),
      mitigation: "Weekly mitigation review with owner and governance escalation for blockers.",
      ownerUserId: project.projectManagerEmail || project.projectManager,
      ownerName: project.projectManager,
      status: project.health === "Green" && index > 0 ? "MITIGATED" : "OPEN",
      createdAt: addDaysDateTime(`${project.startDate}T11:00:00.000Z`, index * 7)
    };
  });
};

const buildSyntheticIssues = (project: PmDashboardProject, seed: number): PmIssue[] => {
  const shouldOpen = project.health !== "Green" || seededPct(seed, 20) > 0.6;
  const openedAt = addDaysDateTime(`${project.startDate}T10:00:00.000Z`, 12);
  const closedAt = shouldOpen ? undefined : addDaysDateTime(openedAt, 14);

  return [
    {
      id: `${project.projectId}-issue-1`,
      projectId: project.projectId,
      title: "Environment handoff delay",
      severity: project.health === "Red" ? "High" : "Medium",
      ownerUserId: project.projectManagerEmail || project.projectManager,
      ownerName: project.projectManager,
      status: shouldOpen ? "OPEN" : "CLOSED",
      openedAt,
      closedAt
    }
  ];
};

const hasReachedProposalReview = (submission: ProjectSubmission) =>
  submission.stage !== "Placemat Proposal" || submission.status !== "Draft";

const hasReachedGovernance = (submission: ProjectSubmission) =>
  submission.stage === "PGO & Finance Review" ||
  submission.stage === "SPO Committee Review" ||
  submission.stage === "Funding Request" ||
  submission.stage === "Live Project" ||
  submission.stage === "Change Request";

const hasReachedSpo = (submission: ProjectSubmission) =>
  submission.stage === "SPO Committee Review" ||
  submission.stage === "Funding Request" ||
  submission.stage === "Live Project" ||
  submission.stage === "Change Request";

const hasReachedFunding = (submission: ProjectSubmission) =>
  submission.stage === "Funding Request" ||
  submission.stage === "Live Project" ||
  submission.workflow.fundingStatus === "Requested" ||
  submission.workflow.fundingStatus === "Funded" ||
  submission.workflow.fundingStatus === "Live";

const hasFundingApproved = (submission: ProjectSubmission) =>
  submission.workflow.fundingStatus === "Funded" || submission.workflow.fundingStatus === "Live";

const hasDeliveryStarted = (submission: ProjectSubmission) =>
  submission.stage === "Live Project" || submission.workflow.fundingStatus === "Live";

const buildSyntheticSlaEvents = (submission: ProjectSubmission): PmSlaEvent[] => {
  const projectId = submission.id;
  const base = toIsoDateTime(submission.createdAt);

  const events: PmSlaEvent[] = [
    {
      id: `${projectId}-sla-1`,
      projectId,
      eventType: "SUBMITTED",
      timestamp: addDaysDateTime(base, 0)
    }
  ];

  if (hasReachedProposalReview(submission)) {
    events.push({
      id: `${projectId}-sla-2`,
      projectId,
      eventType: "SPONSOR_REVIEW_START",
      timestamp: addDaysDateTime(base, 1)
    });
  }

  if (submission.workflow.sponsorDecision === "Approved" || hasReachedGovernance(submission)) {
    events.push({
      id: `${projectId}-sla-3`,
      projectId,
      eventType: "SPONSOR_APPROVED",
      timestamp: addDaysDateTime(base, 3)
    });
  }

  if (hasReachedGovernance(submission)) {
    events.push({
      id: `${projectId}-sla-4`,
      projectId,
      eventType: "PGO_START",
      timestamp: addDaysDateTime(base, 3)
    });
    events.push({
      id: `${projectId}-sla-5`,
      projectId,
      eventType: "FGO_START",
      timestamp: addDaysDateTime(base, 3)
    });
  }

  if (submission.workflow.pgoDecision === "Approved" || hasReachedSpo(submission)) {
    events.push({
      id: `${projectId}-sla-6`,
      projectId,
      eventType: "PGO_DONE",
      timestamp: addDaysDateTime(base, 7)
    });
  }

  if (submission.workflow.financeDecision === "Approved" || hasReachedSpo(submission)) {
    events.push({
      id: `${projectId}-sla-7`,
      projectId,
      eventType: "FGO_DONE",
      timestamp: addDaysDateTime(base, 8)
    });
  }

  if (hasReachedSpo(submission)) {
    events.push({
      id: `${projectId}-sla-8`,
      projectId,
      eventType: "SPO_START",
      timestamp: addDaysDateTime(base, 8)
    });
  }

  if (submission.workflow.spoDecision === "Approved" || hasReachedFunding(submission)) {
    events.push({
      id: `${projectId}-sla-9`,
      projectId,
      eventType: "SPO_DECISION",
      timestamp: addDaysDateTime(base, 11)
    });
  }

  if (hasReachedFunding(submission)) {
    events.push({
      id: `${projectId}-sla-10`,
      projectId,
      eventType: "FR_SUBMITTED",
      timestamp: addDaysDateTime(base, 12)
    });
  }

  if (hasFundingApproved(submission)) {
    events.push({
      id: `${projectId}-sla-11`,
      projectId,
      eventType: "FR_APPROVED",
      timestamp: addDaysDateTime(base, 16)
    });
    events.push({
      id: `${projectId}-sla-12`,
      projectId,
      eventType: "PM_ASSIGNED",
      timestamp: addDaysDateTime(base, 17)
    });
  }

  if (hasDeliveryStarted(submission)) {
    events.push({
      id: `${projectId}-sla-13`,
      projectId,
      eventType: "DELIVERY_START",
      timestamp: addDaysDateTime(base, 18)
    });

    if (submission.status === "Approved" && submission.workflow.fundingStatus === "Live") {
      events.push({
        id: `${projectId}-sla-14`,
        projectId,
        eventType: "DELIVERY_DONE",
        timestamp: addDaysDateTime(base, 42)
      });
    }
  }

  return events;
};

const buildProjectRecord = (submission: ProjectSubmission): PmDashboardProject => {
  const stage = toProjectStage(submission);
  const seed = hashString(submission.id);

  const startDate = toIsoDate(submission.startDate ?? submission.createdAt, new Date(submission.createdAt));
  const baselineStartDate = startDate;
  const baselineEndDate = toIsoDate(submission.endDate ?? addDays(startDate, 180));
  const forecastStartDate = addDays(baselineStartDate, Math.round((seededPct(seed, 2) - 0.4) * 12));
  const forecastEndDate = addDays(baselineEndDate, Math.round((seededPct(seed, 3) - 0.35) * 28));
  const percentComplete = toPercentComplete(submission, stage);

  const budgetRequested = Math.max(0, Number(submission.financials.capex + submission.financials.opex + submission.financials.oneTimeCosts));
  const budgetApproved =
    stage === "PROPOSAL"
      ? budgetRequested * 0.72
      : stage === "FUNDING_REQUEST"
        ? budgetRequested * 0.9
        : budgetRequested * 0.97;

  const spendMultiplier = 0.78 + seededPct(seed, 4) * 0.35;
  const spendToDate = Math.max(0, (budgetApproved * percentComplete) / 100) * spendMultiplier;
  const budgetVariancePct = budgetApproved > 0 ? ((spendToDate - budgetApproved) / budgetApproved) * 100 : 0;
  const varianceDays = Math.max(0, Math.round(daysBetween(baselineEndDate, forecastEndDate)));
  const health = toProjectHealth(submission, stage, percentComplete, varianceDays, budgetVariancePct);

  const annualBenefits = Math.max(0, submission.benefits.revenueUpliftEst + submission.financials.runRateSavings);
  const benefitsTargetTotal = annualBenefits * 5;
  const benefitsRealizedToDate =
    stage === "DELIVERY" || stage === "CLOSED"
      ? (benefitsTargetTotal * clamp((percentComplete - 55) / 45, 0, 1))
      : benefitsTargetTotal * clamp((percentComplete - 70) / 60, 0, 0.35);

  return {
    projectId: submission.id,
    title: submission.title,
    description: submission.summary,
    stage,
    status: submission.status,
    priority: priorityOrder.includes(submission.priority as (typeof priorityOrder)[number])
      ? (submission.priority as PmDashboardProject["priority"])
      : "Medium",
    health,
    startDate,
    endDate: baselineEndDate,
    forecastStartDate,
    forecastEndDate,
    baselineStartDate,
    baselineEndDate,
    percentComplete,
    budgetRequested: round2(budgetRequested),
    budgetApproved: round2(budgetApproved),
    spendToDate: round2(spendToDate),
    benefitsTargetAnnual: round2(annualBenefits),
    benefitsTargetTotal: round2(benefitsTargetTotal),
    benefitsRealizedToDate: round2(benefitsRealizedToDate),
    businessSponsor: submission.businessSponsor || submission.sponsorName || "-",
    businessDelegate: submission.businessDelegate || "-",
    financeSponsor: submission.financeSponsor || "-",
    technologySponsor: submission.technologySponsor || "-",
    benefitsSponsor: submission.benefitsSponsor || "-",
    projectManager: submission.ownerName,
    projectManagerEmail: submission.ownerEmail,
    segmentUnit: submission.segmentUnit || "-",
    businessUnit: submission.businessUnit || submission.segmentUnit || "-",
    lastUpdatedAt: toIsoDateTime(submission.updatedAt)
  };
};

const buildDataset = async (visibleSubmissions: ProjectSubmission[]): Promise<PmDashboardDataset> => {
  const seedData = await readPmDashboardSeed();

  const projects = visibleSubmissions.map((submission) => buildProjectRecord(submission));
  const projectIdSet = new Set(projects.map((project) => project.projectId));

  const generatedMilestones: PmMilestone[] = [];
  const generatedTasks: PmTask[] = [];
  const generatedRisks: PmRisk[] = [];
  const generatedIssues: PmIssue[] = [];
  const generatedSlaEvents: PmSlaEvent[] = [];

  projects.forEach((project) => {
    const seed = hashString(project.projectId);
    generatedMilestones.push(...buildSyntheticMilestones(project, seed));
    generatedTasks.push(...buildSyntheticTasks(project, seed));
    generatedRisks.push(...buildSyntheticRisks(project, seed));
    generatedIssues.push(...buildSyntheticIssues(project, seed));

    const submission = visibleSubmissions.find((row) => row.id === project.projectId);
    if (submission) {
      generatedSlaEvents.push(...buildSyntheticSlaEvents(submission));
    }
  });

  return {
    projects,
    milestones: mergeById(generatedMilestones, seedData.milestones, projectIdSet),
    tasks: mergeById(generatedTasks, seedData.tasks, projectIdSet),
    risks: mergeById(generatedRisks, seedData.risks, projectIdSet),
    issues: mergeById(generatedIssues, seedData.issues, projectIdSet),
    slaEvents: mergeById(generatedSlaEvents, seedData.slaEvents, projectIdSet)
  };
};

const normalizeFilterValue = (value?: string | null) => (value ?? "").trim();

export const normalizePmFilters = (input: Partial<PmDashboardFilters>): PmDashboardFilters => ({
  search: normalizeFilterValue(input.search),
  stage: normalizeFilterValue(input.stage) || allLabel,
  status: normalizeFilterValue(input.status) || allLabel,
  health: normalizeFilterValue(input.health) || allLabel,
  sponsor: normalizeFilterValue(input.sponsor) || allLabel,
  projectManager: normalizeFilterValue(input.projectManager) || allLabel,
  businessUnit: normalizeFilterValue(input.businessUnit) || allLabel,
  dateFrom: normalizeFilterValue(input.dateFrom),
  dateTo: normalizeFilterValue(input.dateTo)
});

const matchesFilter = (candidate: string, filterValue: string) => {
  if (!filterValue || filterValue === allLabel) return true;
  return candidate.toLowerCase().includes(filterValue.toLowerCase());
};

const applyFilters = (projects: PmDashboardProject[], filters: PmDashboardFilters): PmDashboardProject[] => {
  const fromMs = filters.dateFrom ? new Date(filters.dateFrom).getTime() : Number.NaN;
  const toMs = filters.dateTo ? new Date(filters.dateTo).getTime() : Number.NaN;

  return projects.filter((project) => {
    const combinedSearch = `${project.projectId} ${project.title} ${project.description} ${project.projectManager} ${project.businessUnit}`.toLowerCase();
    if (filters.search && !combinedSearch.includes(filters.search.toLowerCase())) {
      return false;
    }

    if (filters.stage !== allLabel && project.stage !== filters.stage) {
      return false;
    }

    if (!matchesFilter(project.status, filters.status)) {
      return false;
    }

    if (filters.health !== allLabel && project.health !== filters.health) {
      return false;
    }

    if (
      filters.sponsor !== allLabel &&
      ![
        project.businessSponsor,
        project.businessDelegate,
        project.financeSponsor,
        project.technologySponsor,
        project.benefitsSponsor
      ]
        .join(" ")
        .toLowerCase()
        .includes(filters.sponsor.toLowerCase())
    ) {
      return false;
    }

    if (!matchesFilter(project.projectManager, filters.projectManager)) {
      return false;
    }

    if (!matchesFilter(project.businessUnit, filters.businessUnit)) {
      return false;
    }

    const startMs = new Date(project.startDate).getTime();
    if (!Number.isNaN(fromMs) && (Number.isNaN(startMs) || startMs < fromMs)) {
      return false;
    }
    if (!Number.isNaN(toMs) && (Number.isNaN(startMs) || startMs > toMs)) {
      return false;
    }

    return true;
  });
};

const mapByProject = <T extends { projectId: string }>(rows: T[]): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();
  rows.forEach((row) => {
    const list = grouped.get(row.projectId);
    if (list) {
      list.push(row);
      return;
    }
    grouped.set(row.projectId, [row]);
  });
  return grouped;
};

const sortByDateAsc = <T>(rows: T[], getValue: (row: T) => string | undefined): T[] =>
  [...rows].sort((a, b) => {
    const aTime = new Date(getValue(a) ?? "").getTime();
    const bTime = new Date(getValue(b) ?? "").getTime();
    const safeA = Number.isNaN(aTime) ? Number.POSITIVE_INFINITY : aTime;
    const safeB = Number.isNaN(bTime) ? Number.POSITIVE_INFINITY : bTime;
    return safeA - safeB;
  });

const getFirstEventTime = (events: PmSlaEvent[], eventType: PmSlaEvent["eventType"]) => {
  const event = events.find((row) => row.eventType === eventType);
  if (!event) return undefined;
  const ms = new Date(event.timestamp).getTime();
  return Number.isNaN(ms) ? undefined : ms;
};

const durationOrPending = (startMs?: number, endMs?: number, nowMs = Date.now()) => {
  if (!startMs) {
    return { days: 0, pending: false };
  }

  const end = endMs ?? nowMs;
  const days = (end - startMs) / 86_400_000;
  return {
    days: round2(Math.max(0, days)),
    pending: !endMs
  };
};

const computeProjectSla = (events: PmSlaEvent[]): ProjectSlaStats => {
  const sortedEvents = sortByDateAsc(events, (event) => event.timestamp);

  const submitted = getFirstEventTime(sortedEvents, "SUBMITTED");
  const sponsorStart = getFirstEventTime(sortedEvents, "SPONSOR_REVIEW_START");
  const sponsorDone = getFirstEventTime(sortedEvents, "SPONSOR_APPROVED");
  const pgoStart = getFirstEventTime(sortedEvents, "PGO_START");
  const pgoDone = getFirstEventTime(sortedEvents, "PGO_DONE");
  const fgoStart = getFirstEventTime(sortedEvents, "FGO_START");
  const fgoDone = getFirstEventTime(sortedEvents, "FGO_DONE");
  const spoStart = getFirstEventTime(sortedEvents, "SPO_START");
  const spoDone = getFirstEventTime(sortedEvents, "SPO_DECISION");
  const frApproved = getFirstEventTime(sortedEvents, "FR_APPROVED");

  const now = Date.now();
  const sponsor = durationOrPending(sponsorStart, sponsorDone, now);
  const pgo = durationOrPending(pgoStart, pgoDone, now);
  const fgo = durationOrPending(fgoStart, fgoDone, now);
  const spo = durationOrPending(spoStart, spoDone, now);
  const cycle = durationOrPending(submitted, frApproved ?? spoDone, now);

  return {
    sponsorDays: sponsor.days,
    pgoDays: pgo.days,
    fgoDays: fgo.days,
    spoDays: spo.days,
    cycleDays: cycle.days,
    sponsorPending: sponsor.pending,
    pgoPending: pgo.pending,
    fgoPending: fgo.pending,
    spoPending: spo.pending
  };
};

const getMilestoneDaysOverdue = (milestone: Pick<PmMilestone, "status" | "plannedDate" | "actualDate">) => {
  if (milestone.status === "DONE") {
    if (!milestone.actualDate) return 0;
    return Math.max(0, Math.round(daysBetween(milestone.plannedDate, milestone.actualDate)));
  }

  const nowIso = new Date().toISOString().slice(0, 10);
  return Math.max(0, Math.round(daysBetween(milestone.plannedDate, nowIso)));
};

const getTaskDaysOverdue = (task: PmTask) => {
  if (task.status === "DONE") return 0;
  const nowIso = new Date().toISOString().slice(0, 10);
  return Math.max(0, Math.round(daysBetween(task.dueDate, nowIso)));
};

const monthKey = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

const uniqueSorted = (values: string[]) =>
  Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

const toContext = (dataset: PmDashboardDataset, visibleSubmissions: ProjectSubmission[]): DashboardContext => ({
  lastRefreshedAt: new Date().toISOString(),
  submissionsByProject: new Map(visibleSubmissions.map((submission) => [submission.id, submission])),
  projects: dataset.projects,
  milestones: dataset.milestones,
  tasks: dataset.tasks,
  risks: dataset.risks,
  issues: dataset.issues,
  slaEvents: dataset.slaEvents,
  changeIndicators: {},
  changeAnalytics: {
    projectsWithActiveChanges: 0,
    changeRequestsByStatus: {},
    totalBudgetImpact: 0,
    scheduleImpactTrend: [],
    avgApprovalTimeHours: 0,
    projectsWithMoreThan3Changes: []
  }
});

const buildFilterOptions = (projects: PmDashboardProject[]) => {
  const stages = [allLabel, ...uniqueSorted(projects.map((project) => project.stage))];
  const statuses = [allLabel, ...uniqueSorted(projects.map((project) => project.status))];
  const health = [allLabel, "Green", "Amber", "Red"];
  const sponsors = [
    allLabel,
    ...uniqueSorted(
      projects
        .flatMap((project) => [
          project.businessSponsor,
          project.businessDelegate,
          project.financeSponsor,
          project.technologySponsor,
          project.benefitsSponsor
        ])
        .filter((value) => value !== "-")
    )
  ];
  const projectManagers = [allLabel, ...uniqueSorted(projects.map((project) => project.projectManager))];
  const businessUnits = [allLabel, ...uniqueSorted(projects.map((project) => project.businessUnit))];

  return {
    stages,
    statuses,
    health,
    sponsors,
    projectManagers,
    businessUnits
  };
};

const buildKpis = (
  projects: PmDashboardProject[],
  milestonesByProject: Map<string, PmMilestone[]>,
  tasksByProject: Map<string, PmTask[]>,
  slaByProject: Map<string, ProjectSlaStats>
): PmKpis => {
  const total = projects.length;
  if (total === 0) {
    return {
      totalActiveProjects: 0,
      onTrackPct: 0,
      atRiskCount: 0,
      slaCompliancePct: 0,
      avgCycleTimeDays: 0,
      overdueMilestones: 0,
      overdueTasks: 0
    };
  }

  let onTrack = 0;
  let atRisk = 0;
  let slaCompliant = 0;
  let cycleTotal = 0;
  let overdueMilestones = 0;
  let overdueTasks = 0;

  projects.forEach((project) => {
    const milestones = milestonesByProject.get(project.projectId) ?? [];
    const tasks = tasksByProject.get(project.projectId) ?? [];
    const sla = slaByProject.get(project.projectId) ?? {
      sponsorDays: 0,
      pgoDays: 0,
      fgoDays: 0,
      spoDays: 0,
      cycleDays: 0,
      sponsorPending: false,
      pgoPending: false,
      fgoPending: false,
      spoPending: false
    };

    const projectOverdueMilestones = milestones.filter((row) => getMilestoneDaysOverdue(row) > 0).length;
    const projectOverdueTasks = tasks.filter((row) => getTaskDaysOverdue(row) > 0).length;

    const scheduleVarianceDays = Math.max(0, Math.round(daysBetween(project.baselineEndDate, project.forecastEndDate)));
    const budgetVariancePct = project.budgetApproved > 0 ? ((project.spendToDate - project.budgetApproved) / project.budgetApproved) * 100 : 0;

    const projectAtRisk =
      project.health !== "Green" ||
      projectOverdueMilestones > 0 ||
      projectOverdueTasks > 0 ||
      scheduleVarianceDays > 14 ||
      budgetVariancePct > 20 ||
      sla.cycleDays > SLA_TARGETS.cycle;

    if (!projectAtRisk) {
      onTrack += 1;
    }

    if (projectAtRisk) {
      atRisk += 1;
    }

    if (sla.cycleDays <= SLA_TARGETS.cycle) {
      slaCompliant += 1;
    }

    cycleTotal += sla.cycleDays;
    overdueMilestones += projectOverdueMilestones;
    overdueTasks += projectOverdueTasks;
  });

  return {
    totalActiveProjects: total,
    onTrackPct: round2((onTrack / total) * 100),
    atRiskCount: atRisk,
    slaCompliancePct: round2((slaCompliant / total) * 100),
    avgCycleTimeDays: round2(cycleTotal / total),
    overdueMilestones,
    overdueTasks
  };
};

const getNextMilestoneLabel = (milestones: PmMilestone[]) => {
  const next = sortByDateAsc(
    milestones.filter((row) => row.status !== "DONE"),
    (row) => row.forecastDate
  )[0];
  return next ? `${next.name} (${next.forecastDate})` : "-";
};

const buildAttentionRows = (
  projects: PmDashboardProject[],
  milestonesByProject: Map<string, PmMilestone[]>,
  tasksByProject: Map<string, PmTask[]>,
  risksByProject: Map<string, PmRisk[]>,
  slaByProject: Map<string, ProjectSlaStats>
): PmAttentionRow[] => {
  const rows = projects
    .map((project) => {
      const milestones = milestonesByProject.get(project.projectId) ?? [];
      const tasks = tasksByProject.get(project.projectId) ?? [];
      const risks = risksByProject.get(project.projectId) ?? [];
      const sla = slaByProject.get(project.projectId);

      const overdueMilestones = milestones.map(getMilestoneDaysOverdue);
      const overdueTasks = tasks.map(getTaskDaysOverdue);
      const highestOverdue = Math.max(0, ...overdueMilestones, ...overdueTasks);
      const hasCriticalRisk = risks.some((risk) => risk.status === "OPEN" && risk.severity === "Critical");
      const cycleDays = sla?.cycleDays ?? 0;

      const include =
        cycleDays > SLA_TARGETS.cycle ||
        highestOverdue > 0 ||
        hasCriticalRisk ||
        project.health === "Red";

      if (!include) {
        return null;
      }

      const action = hasCriticalRisk
        ? "Escalate risk mitigation plan"
        : highestOverdue > 0
          ? "Recover overdue milestones/tasks"
          : "Review approval bottlenecks";

      return {
        projectId: project.projectId,
        project: project.title,
        projectManager: project.projectManager,
        stage: project.stage,
        health: project.health,
        slaDays: round2(cycleDays),
        nextMilestone: getNextMilestoneLabel(milestones),
        daysOverdue: highestOverdue,
        action
      } satisfies PmAttentionRow;
    })
    .filter((row): row is PmAttentionRow => Boolean(row));

  return rows.sort((a, b) => b.daysOverdue - a.daysOverdue || b.slaDays - a.slaDays).slice(0, 25);
};

const buildSlaMap = (eventsByProject: Map<string, PmSlaEvent[]>) => {
  const map = new Map<string, ProjectSlaStats>();
  eventsByProject.forEach((events, projectId) => {
    map.set(projectId, computeProjectSla(events));
  });
  return map;
};

const getStatusTrend = (projects: PmDashboardProject[]) => {
  const rows = new Map<string, Record<string, number>>();

  projects.forEach((project) => {
    const month = monthKey(project.lastUpdatedAt);
    const current = rows.get(month) ?? {};
    current[project.status] = (current[project.status] ?? 0) + 1;
    rows.set(month, current);
  });

  return Array.from(rows.entries())
    .sort((a, b) => {
      const aTime = new Date(`01 ${a[0]}`).getTime();
      const bTime = new Date(`01 ${b[0]}`).getTime();
      const safeA = Number.isNaN(aTime) ? 0 : aTime;
      const safeB = Number.isNaN(bTime) ? 0 : bTime;
      return safeA - safeB;
    })
    .map(([month, totals]) => ({ month, totals }));
};

const buildBottlenecks = (slaByProject: Map<string, ProjectSlaStats>) => {
  const stats = Array.from(slaByProject.values());
  const mean = (items: number[]) => (items.length === 0 ? 0 : round2(items.reduce((sum, value) => sum + value, 0) / items.length));

  return [
    { step: "Sponsor", avgDays: mean(stats.map((row) => row.sponsorDays)) },
    { step: "PGO", avgDays: mean(stats.map((row) => row.pgoDays)) },
    { step: "FGO", avgDays: mean(stats.map((row) => row.fgoDays)) },
    { step: "SPO", avgDays: mean(stats.map((row) => row.spoDays)) }
  ];
};

const buildSlaAgingBuckets = (slaByProject: Map<string, ProjectSlaStats>) => {
  const buckets = {
    "0-3d": 0,
    "4-7d": 0,
    "8-14d": 0,
    "15d+": 0
  };

  Array.from(slaByProject.values()).forEach((stats) => {
    const pendingDurations = [
      stats.sponsorPending ? stats.sponsorDays : 0,
      stats.pgoPending ? stats.pgoDays : 0,
      stats.fgoPending ? stats.fgoDays : 0,
      stats.spoPending ? stats.spoDays : 0
    ];

    const age = Math.max(...pendingDurations);
    if (age <= 0) {
      return;
    }
    if (age <= 3) {
      buckets["0-3d"] += 1;
    } else if (age <= 7) {
      buckets["4-7d"] += 1;
    } else if (age <= 14) {
      buckets["8-14d"] += 1;
    } else {
      buckets["15d+"] += 1;
    }
  });

  return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
};

const buildSlaComplianceTrend = (projects: PmDashboardProject[], slaByProject: Map<string, ProjectSlaStats>) => {
  const byMonth = new Map<string, { total: number; compliant: number }>();

  projects.forEach((project) => {
    const month = monthKey(project.lastUpdatedAt);
    const current = byMonth.get(month) ?? { total: 0, compliant: 0 };
    const sla = slaByProject.get(project.projectId);
    current.total += 1;
    if ((sla?.cycleDays ?? 0) <= SLA_TARGETS.cycle) {
      current.compliant += 1;
    }
    byMonth.set(month, current);
  });

  return Array.from(byMonth.entries())
    .sort((a, b) => {
      const aTime = new Date(`01 ${a[0]}`).getTime();
      const bTime = new Date(`01 ${b[0]}`).getTime();
      return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
    })
    .map(([month, value]) => ({
      month,
      compliancePct: value.total === 0 ? 0 : round2((value.compliant / value.total) * 100)
    }));
};

const buildCycleDistribution = (slaByProject: Map<string, ProjectSlaStats>) => {
  const buckets = {
    "0-10": 0,
    "11-20": 0,
    "21-30": 0,
    "31+": 0
  };

  slaByProject.forEach((stats) => {
    const cycle = stats.cycleDays;
    if (cycle <= 10) buckets["0-10"] += 1;
    else if (cycle <= 20) buckets["11-20"] += 1;
    else if (cycle <= 30) buckets["21-30"] += 1;
    else buckets["31+"] += 1;
  });

  return Object.entries(buckets).map(([label, value]) => ({ label, value }));
};

const buildThroughput = (events: PmSlaEvent[]) => {
  const byMonth = new Map<string, number>();
  const completionEvents = events.filter((event) =>
    ["SPONSOR_APPROVED", "PGO_DONE", "FGO_DONE", "SPO_DECISION", "FR_APPROVED"].includes(event.eventType)
  );

  completionEvents.forEach((event) => {
    const month = monthKey(event.timestamp);
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  });

  return Array.from(byMonth.entries())
    .sort((a, b) => {
      const aTime = new Date(`01 ${a[0]}`).getTime();
      const bTime = new Date(`01 ${b[0]}`).getTime();
      return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
    })
    .map(([month, approvalsCompleted]) => ({ month, approvalsCompleted }));
};

const toMonthSeries = (rows: Array<{ date: string; kind: "planned" | "completed" }>) => {
  const monthRows = new Map<string, { planned: number; completed: number }>();
  rows.forEach((row) => {
    const month = monthKey(row.date);
    const current = monthRows.get(month) ?? { planned: 0, completed: 0 };
    if (row.kind === "planned") {
      current.planned += 1;
    } else {
      current.completed += 1;
    }
    monthRows.set(month, current);
  });

  return Array.from(monthRows.entries())
    .sort((a, b) => {
      const aTime = new Date(`01 ${a[0]}`).getTime();
      const bTime = new Date(`01 ${b[0]}`).getTime();
      return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
    })
    .map(([month, values]) => ({ month, planned: values.planned, completed: values.completed }));
};

const buildRiskHeatmap = (risks: PmRisk[]) => {
  const cellMap = new Map<string, { probability: PmRisk["probability"]; impactArea: PmRisk["impactArea"]; count: number }>();

  risks.forEach((risk) => {
    const key = `${risk.probability}::${risk.impactArea}`;
    const current = cellMap.get(key) ?? {
      probability: risk.probability,
      impactArea: risk.impactArea,
      count: 0
    };
    current.count += 1;
    cellMap.set(key, current);
  });

  return Array.from(cellMap.values()).sort((a, b) => {
    const probCmp = riskProbabilityOrder.indexOf(a.probability) - riskProbabilityOrder.indexOf(b.probability);
    if (probCmp !== 0) return probCmp;
    return impactAreaOrder.indexOf(a.impactArea) - impactAreaOrder.indexOf(b.impactArea);
  });
};

const buildRiskTrend = (risks: PmRisk[], issues: PmIssue[]) => {
  const monthMap = new Map<string, { opened: number; closed: number }>();

  risks.forEach((risk) => {
    const month = monthKey(risk.createdAt);
    const current = monthMap.get(month) ?? { opened: 0, closed: 0 };
    current.opened += 1;
    if (risk.status === "CLOSED" || risk.status === "MITIGATED") {
      current.closed += 1;
    }
    monthMap.set(month, current);
  });

  issues.forEach((issue) => {
    const openedMonth = monthKey(issue.openedAt);
    const openedBucket = monthMap.get(openedMonth) ?? { opened: 0, closed: 0 };
    openedBucket.opened += 1;
    monthMap.set(openedMonth, openedBucket);

    if (issue.closedAt) {
      const closedMonth = monthKey(issue.closedAt);
      const closedBucket = monthMap.get(closedMonth) ?? { opened: 0, closed: 0 };
      closedBucket.closed += 1;
      monthMap.set(closedMonth, closedBucket);
    }
  });

  return Array.from(monthMap.entries())
    .sort((a, b) => {
      const aTime = new Date(`01 ${a[0]}`).getTime();
      const bTime = new Date(`01 ${b[0]}`).getTime();
      return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
    })
    .map(([month, value]) => ({ month, opened: value.opened, closed: value.closed }));
};

const buildCriticalItems = (
  risks: PmRisk[],
  issues: PmIssue[],
  projectLookup: Map<string, PmDashboardProject>
): PmRiskChartsResponse["criticalItems"] => {
  const now = Date.now();

  const riskRows = risks
    .filter((risk) => risk.status === "OPEN" && (risk.severity === "High" || risk.severity === "Critical"))
    .map((risk) => ({
      id: risk.id,
      projectId: risk.projectId,
      project: projectLookup.get(risk.projectId)?.title ?? risk.projectId,
      type: "Risk" as const,
      title: risk.title,
      severity: risk.severity,
      owner: risk.ownerName,
      status: risk.status,
      ageDays: round2((now - new Date(risk.createdAt).getTime()) / 86_400_000)
    }));

  const issueRows = issues
    .filter((issue) => issue.status !== "CLOSED" && (issue.severity === "High" || issue.severity === "Critical"))
    .map((issue) => ({
      id: issue.id,
      projectId: issue.projectId,
      project: projectLookup.get(issue.projectId)?.title ?? issue.projectId,
      type: "Issue" as const,
      title: issue.title,
      severity: issue.severity,
      owner: issue.ownerName,
      status: issue.status,
      ageDays: round2((now - new Date(issue.openedAt).getTime()) / 86_400_000)
    }));

  return [...riskRows, ...issueRows].sort((a, b) => b.ageDays - a.ageDays).slice(0, 25);
};

const computeForecastToComplete = (project: PmDashboardProject) => {
  const remaining = Math.max(project.budgetApproved - project.spendToDate, 0);
  const riskBuffer = project.health === "Red" ? 0.2 : project.health === "Amber" ? 0.12 : 0.06;
  return round2(project.spendToDate + remaining * (1 + riskBuffer));
};

const computeProjectRoi = (project: PmDashboardProject) => {
  if (project.budgetApproved <= 0) {
    return 0;
  }
  return round2(project.benefitsTargetTotal / project.budgetApproved);
};

const parsePaginationNumber = (value: string | null, fallback: number, min: number, max: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
};

const contextCacheKey = (user: RbacUser) => {
  const id = user.id ?? "-";
  const email = user.email ?? "-";
  const role = user.roleType ?? "-";
  return `${id}|${email}|${role}`;
};

const filterCacheKey = (filters: PmDashboardFilters) => JSON.stringify(filters);

const getCachedContext = (key: string): DashboardContext | null => {
  const cached = dashboardCache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    dashboardCache.delete(key);
    return null;
  }

  return cached.value;
};

const setCachedContext = (key: string, value: DashboardContext) => {
  dashboardCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value
  });
};

const getContextForUser = async (user: RbacUser): Promise<DashboardContext> => {
  const key = contextCacheKey(user);
  const cached = getCachedContext(key);
  if (cached) {
    return cached;
  }

  const submissions = await listSubmissions();
  const visibleSubmissions = filterSubmissionsByAccess(user, submissions, "dashboard");
  const dataset = await buildDataset(visibleSubmissions);
  const context = toContext(dataset, visibleSubmissions);
  setCachedContext(key, context);
  return context;
};

type FilteredContext = {
  source: DashboardContext;
  filters: PmDashboardFilters;
  projects: PmDashboardProject[];
  projectIds: Set<string>;
  milestones: PmMilestone[];
  tasks: PmTask[];
  risks: PmRisk[];
  issues: PmIssue[];
  slaEvents: PmSlaEvent[];
  milestonesByProject: Map<string, PmMilestone[]>;
  tasksByProject: Map<string, PmTask[]>;
  risksByProject: Map<string, PmRisk[]>;
  issuesByProject: Map<string, PmIssue[]>;
  eventsByProject: Map<string, PmSlaEvent[]>;
  slaByProject: Map<string, ProjectSlaStats>;
  changeIndicators: DashboardContext["changeIndicators"];
  changeAnalytics: DashboardContext["changeAnalytics"];
};

const getFilteredContext = async (user: RbacUser, rawFilters: Partial<PmDashboardFilters>): Promise<FilteredContext> => {
  const source = await getContextForUser(user);
  const filters = normalizePmFilters(rawFilters);

  const filteredProjects = applyFilters(source.projects, filters);
  const projectIds = new Set(filteredProjects.map((project) => project.projectId));

  const milestones = source.milestones.filter((row) => projectIds.has(row.projectId));
  const tasks = source.tasks.filter((row) => projectIds.has(row.projectId));
  const risks = source.risks.filter((row) => projectIds.has(row.projectId));
  const issues = source.issues.filter((row) => projectIds.has(row.projectId));
  const slaEvents = source.slaEvents.filter((row) => projectIds.has(row.projectId));

  const milestonesByProject = mapByProject(milestones);
  const tasksByProject = mapByProject(tasks);
  const risksByProject = mapByProject(risks);
  const issuesByProject = mapByProject(issues);
  const eventsByProject = mapByProject(sortByDateAsc(slaEvents, (row) => row.timestamp));
  const slaByProject = buildSlaMap(eventsByProject);
  const scopedProjectIds = Array.from(projectIds);
  const [changeIndicators, changeAnalytics] = await Promise.all([
    getProjectChangeIndicatorMap(scopedProjectIds),
    getChangeManagementAnalytics(scopedProjectIds)
  ]);

  return {
    source,
    filters,
    projects: filteredProjects,
    projectIds,
    milestones,
    tasks,
    risks,
    issues,
    slaEvents,
    milestonesByProject,
    tasksByProject,
    risksByProject,
    issuesByProject,
    eventsByProject,
    slaByProject,
    changeIndicators,
    changeAnalytics
  };
};

const getFilteredContextFromSubmissions = async (
  submissions: ProjectSubmission[],
  user: RbacUser,
  rawFilters: Partial<PmDashboardFilters>
): Promise<FilteredContext> => {
  const sourceSubmissions = filterSubmissionsByAccess(user, submissions, "dashboard");
  const dataset = await buildDataset(sourceSubmissions);
  const source = toContext(dataset, sourceSubmissions);
  const filters = normalizePmFilters(rawFilters);
  const projects = applyFilters(source.projects, filters);
  const projectIds = new Set(projects.map((project) => project.projectId));

  const milestones = source.milestones.filter((row) => projectIds.has(row.projectId));
  const tasks = source.tasks.filter((row) => projectIds.has(row.projectId));
  const risks = source.risks.filter((row) => projectIds.has(row.projectId));
  const issues = source.issues.filter((row) => projectIds.has(row.projectId));
  const slaEvents = source.slaEvents.filter((row) => projectIds.has(row.projectId));

  const milestonesByProject = mapByProject(milestones);
  const tasksByProject = mapByProject(tasks);
  const risksByProject = mapByProject(risks);
  const issuesByProject = mapByProject(issues);
  const eventsByProject = mapByProject(sortByDateAsc(slaEvents, (row) => row.timestamp));
  const slaByProject = buildSlaMap(eventsByProject);
  const scopedProjectIds = Array.from(projectIds);
  const [changeIndicators, changeAnalytics] = await Promise.all([
    getProjectChangeIndicatorMap(scopedProjectIds),
    getChangeManagementAnalytics(scopedProjectIds)
  ]);

  return {
    source,
    filters,
    projects,
    projectIds,
    milestones,
    tasks,
    risks,
    issues,
    slaEvents,
    milestonesByProject,
    tasksByProject,
    risksByProject,
    issuesByProject,
    eventsByProject,
    slaByProject,
    changeIndicators,
    changeAnalytics
  };
};

const buildSummary = (ctx: FilteredContext): PmSummaryResponse => {
  const kpis = buildKpis(ctx.projects, ctx.milestonesByProject, ctx.tasksByProject, ctx.slaByProject);
  const attentionRequired = buildAttentionRows(
    ctx.projects,
    ctx.milestonesByProject,
    ctx.tasksByProject,
    ctx.risksByProject,
    ctx.slaByProject
  );

  return {
    lastRefreshedAt: ctx.source.lastRefreshedAt,
    kpis,
    changeWidgets: {
      projectsWithActiveChanges: ctx.changeAnalytics.projectsWithActiveChanges,
      changeRequestsByStatus: Object.entries(ctx.changeAnalytics.changeRequestsByStatus).map(([status, count]) => ({
        status,
        count
      })),
      totalBudgetImpact: ctx.changeAnalytics.totalBudgetImpact,
      scheduleImpactTrend: ctx.changeAnalytics.scheduleImpactTrend,
      avgChangeApprovalTimeHours: ctx.changeAnalytics.avgApprovalTimeHours,
      projectsWithMoreThan3Changes: ctx.changeAnalytics.projectsWithMoreThan3Changes
    },
    filters: buildFilterOptions(ctx.source.projects),
    attentionRequired
  };
};

const buildProjects = (ctx: FilteredContext, page: number, pageSize: number): PmProjectsResponse => {
  const rows = ctx.projects
    .map((project) => {
      const milestones = ctx.milestonesByProject.get(project.projectId) ?? [];
      const tasks = ctx.tasksByProject.get(project.projectId) ?? [];
      const sla = ctx.slaByProject.get(project.projectId);
      const overdueTaskCount = tasks.filter((task) => getTaskDaysOverdue(task) > 0).length;
      const overdueMilestoneCount = milestones.filter((milestone) => getMilestoneDaysOverdue(milestone) > 0).length;

      return {
        ...project,
        overdueTaskCount,
        overdueMilestoneCount,
        nextMilestone: getNextMilestoneLabel(milestones),
        slaCycleDays: round2(sla?.cycleDays ?? 0),
        roiProxy: computeProjectRoi(project),
        budgetVariance: round2(project.spendToDate - project.budgetApproved),
        latestChangeStatus: ctx.changeIndicators[project.projectId]?.latestChangeStatus ?? "NONE",
        changeRiskIndicator: ctx.changeIndicators[project.projectId]?.changeRiskIndicator ?? "NONE",
        hasOpenChangeRequest: ctx.changeIndicators[project.projectId]?.hasOpenChangeRequest ?? false,
        hasBudgetImpact: ctx.changeIndicators[project.projectId]?.hasBudgetImpact ?? false,
        hasScheduleImpact: ctx.changeIndicators[project.projectId]?.hasScheduleImpact ?? false,
        hasRiskEscalation: ctx.changeIndicators[project.projectId]?.hasRiskEscalation ?? false
      };
    })
    .sort((a, b) => a.projectId.localeCompare(b.projectId, undefined, { numeric: true }));

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    page,
    pageSize,
    total,
    data: rows.slice(start, end)
  };
};

const buildStageHealthCharts = (ctx: FilteredContext): PmStageHealthChartResponse => {
  const stageCounts = new Map<PmDashboardProject["stage"], number>();
  const healthCounts = new Map<PmDashboardProject["health"], number>();

  ctx.projects.forEach((project) => {
    stageCounts.set(project.stage, (stageCounts.get(project.stage) ?? 0) + 1);
    healthCounts.set(project.health, (healthCounts.get(project.health) ?? 0) + 1);
  });

  return {
    byStage: Array.from(stageCounts.entries()).map(([stage, count]) => ({ stage, count })),
    byHealth: Array.from(healthCounts.entries()).map(([health, count]) => ({ health, count })),
    statusTrend: getStatusTrend(ctx.projects),
    bottlenecks: buildBottlenecks(ctx.slaByProject)
  };
};

const buildSlaCharts = (ctx: FilteredContext): PmSlaChartResponse => ({
  agingBuckets: buildSlaAgingBuckets(ctx.slaByProject),
  complianceTrend: buildSlaComplianceTrend(ctx.projects, ctx.slaByProject),
  cycleDistribution: buildCycleDistribution(ctx.slaByProject),
  throughput: buildThroughput(ctx.slaEvents),
  stepDurations: buildBottlenecks(ctx.slaByProject)
});

const buildScheduleCharts = (ctx: FilteredContext): PmScheduleChartResponse => {
  const timeline = ctx.projects.map((project) => ({
    projectId: project.projectId,
    project: project.title,
    plannedStart: project.baselineStartDate,
    plannedEnd: project.baselineEndDate,
    forecastStart: project.forecastStartDate,
    forecastEnd: project.forecastEndDate,
    varianceDays: Math.max(0, Math.round(daysBetween(project.baselineEndDate, project.forecastEndDate))),
    health: project.health
  }));

  const milestoneRows = ctx.milestones
    .map((milestone) => ({
      id: milestone.id,
      projectId: milestone.projectId,
      project: ctx.projects.find((project) => project.projectId === milestone.projectId)?.title ?? milestone.projectId,
      name: milestone.name,
      plannedDate: milestone.plannedDate,
      forecastDate: milestone.forecastDate,
      actualDate: milestone.actualDate,
      status: milestone.status,
      daysOverdue: getMilestoneDaysOverdue(milestone)
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.plannedDate.localeCompare(b.plannedDate));

  const milestoneSeriesInput: Array<{ date: string; kind: "planned" | "completed" }> = [];
  ctx.milestones.forEach((milestone) => {
    milestoneSeriesInput.push({ date: milestone.plannedDate, kind: "planned" });
    if (milestone.actualDate) {
      milestoneSeriesInput.push({ date: milestone.actualDate, kind: "completed" });
    }
  });

  return {
    timeline,
    milestoneBurndown: toMonthSeries(milestoneSeriesInput),
    milestones: milestoneRows
  };
};

const buildRiskCharts = (ctx: FilteredContext): PmRiskChartsResponse => {
  const projectLookup = new Map(ctx.projects.map((project) => [project.projectId, project]));
  return {
    heatmap: buildRiskHeatmap(ctx.risks),
    criticalItems: buildCriticalItems(ctx.risks, ctx.issues, projectLookup),
    trend: buildRiskTrend(ctx.risks, ctx.issues)
  };
};

const buildResourcesCharts = (ctx: FilteredContext): PmResourcesChartsResponse => {
  const nowIso = new Date().toISOString().slice(0, 10);
  const in14 = addDays(nowIso, 14);
  const in30 = addDays(nowIso, 30);

  const byOwner14 = new Map<string, number>();
  const byOwner30 = new Map<string, number>();
  const openTasksByOwner = new Map<string, number>();
  const overdueByOwner = new Map<string, number>();

  ctx.tasks.forEach((task) => {
    const owner = task.ownerName || "Unassigned";
    if (task.status !== "DONE") {
      openTasksByOwner.set(owner, (openTasksByOwner.get(owner) ?? 0) + 1);
    }

    if (task.status !== "DONE" && task.dueDate <= in14) {
      byOwner14.set(owner, (byOwner14.get(owner) ?? 0) + 1);
    }
    if (task.status !== "DONE" && task.dueDate <= in30) {
      byOwner30.set(owner, (byOwner30.get(owner) ?? 0) + 1);
    }
    if (getTaskDaysOverdue(task) > 0) {
      overdueByOwner.set(owner, (overdueByOwner.get(owner) ?? 0) + 1);
    }
  });

  const capacityMap = new Map<string, number>();
  ctx.projects.forEach((project) => {
    const owner = project.projectManager || "Unassigned";
    capacityMap.set(owner, (capacityMap.get(owner) ?? 0) + 1);
  });

  const ownerNames = uniqueSorted([
    ...Array.from(byOwner14.keys()),
    ...Array.from(byOwner30.keys()),
    ...Array.from(capacityMap.keys()),
    ...Array.from(openTasksByOwner.keys())
  ]);

  return {
    workload14: ownerNames.map((owner) => ({ owner, tasksDue: byOwner14.get(owner) ?? 0 })),
    workload30: ownerNames.map((owner) => ({ owner, tasksDue: byOwner30.get(owner) ?? 0 })),
    capacity: ownerNames.map((owner) => ({
      owner,
      assignedProjects: capacityMap.get(owner) ?? 0,
      overdueActions: overdueByOwner.get(owner) ?? 0
    })),
    table: ownerNames.map((owner) => ({
      owner,
      assignedProjects: capacityMap.get(owner) ?? 0,
      openTasks: openTasksByOwner.get(owner) ?? 0,
      overdueTasks: overdueByOwner.get(owner) ?? 0
    }))
  };
};

const buildDrilldown = async (ctx: FilteredContext, projectId: string): Promise<PmDrilldownResponse | null> => {
  const project = ctx.projects.find((row) => row.projectId === projectId);
  if (!project) {
    return null;
  }

  const submission = ctx.source.submissionsByProject.get(project.projectId);
  const milestones = sortByDateAsc(ctx.milestonesByProject.get(project.projectId) ?? [], (row) => row.plannedDate);
  const tasks = sortByDateAsc(ctx.tasksByProject.get(project.projectId) ?? [], (row) => row.dueDate);
  const risks = sortByDateAsc(ctx.risksByProject.get(project.projectId) ?? [], (row) => row.createdAt);
  const issues = sortByDateAsc(ctx.issuesByProject.get(project.projectId) ?? [], (row) => row.openedAt);
  const events = sortByDateAsc(ctx.eventsByProject.get(project.projectId) ?? [], (row) => row.timestamp);
  const sla = ctx.slaByProject.get(project.projectId) ?? {
    sponsorDays: 0,
    pgoDays: 0,
    fgoDays: 0,
    spoDays: 0,
    cycleDays: 0,
    sponsorPending: false,
    pgoPending: false,
    fgoPending: false,
    spoPending: false
  };

  const doneMilestones = milestones.filter((milestone) => milestone.status === "DONE");
  const onTimeMilestones = doneMilestones.filter(
    (milestone) => (milestone.actualDate ? daysBetween(milestone.plannedDate, milestone.actualDate) <= 0 : false)
  );

  const milestoneRows = milestones.map((milestone) => ({
    id: milestone.id,
    projectId: milestone.projectId,
    project: project.title,
    name: milestone.name,
    plannedDate: milestone.plannedDate,
    forecastDate: milestone.forecastDate,
    actualDate: milestone.actualDate,
    status: milestone.status,
    daysOverdue: getMilestoneDaysOverdue(milestone)
  }));
  const changeLog = await getProjectChangeLog(project.projectId);

  return {
    project,
    schedule: {
      varianceDays: Math.max(0, Math.round(daysBetween(project.baselineEndDate, project.forecastEndDate))),
      onTimeMilestoneRate: doneMilestones.length === 0 ? 0 : round2((onTimeMilestones.length / doneMilestones.length) * 100),
      upcomingMilestones: milestoneRows.filter((row) => row.status !== "DONE").slice(0, 8)
    },
    sla: {
      sponsorDays: sla.sponsorDays,
      pgoDays: sla.pgoDays,
      fgoDays: sla.fgoDays,
      spoDays: sla.spoDays,
      cycleDays: sla.cycleDays,
      compliance: sla.cycleDays <= SLA_TARGETS.cycle
    },
    tasks,
    risks,
    issues,
    milestones,
    slaTimeline: events,
    approvals:
      submission?.approvalStages?.map((row) => ({
        stage: row.stage,
        status: row.status,
        decidedAt: row.decidedAt,
        comment: row.comment
      })) ?? [],
    auditTrail:
      submission?.auditTrail?.map((entry) => ({
        action: entry.action,
        stage: entry.stage,
        status: entry.status,
        createdAt: entry.createdAt,
        note: entry.note
      })) ?? [],
    changeLog,
    financials: {
      budgetRequested: project.budgetRequested,
      budgetApproved: project.budgetApproved,
      spendToDate: project.spendToDate,
      forecastToComplete: computeForecastToComplete(project),
      benefitsTargetTotal: project.benefitsTargetTotal,
      benefitsRealizedToDate: project.benefitsRealizedToDate,
      roiProxy: computeProjectRoi(project)
    }
  };
};

export const parsePmDashboardFiltersFromUrl = (request: Request): PmDashboardFilters => {
  const { searchParams } = new URL(request.url);
  return normalizePmFilters({
    search: searchParams.get("search") ?? undefined,
    stage: searchParams.get("stage") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    health: searchParams.get("health") ?? undefined,
    sponsor: searchParams.get("sponsor") ?? undefined,
    projectManager: searchParams.get("projectManager") ?? undefined,
    businessUnit: searchParams.get("businessUnit") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined
  });
};

export const parsePmDashboardPaginationFromUrl = (request: Request) => {
  const { searchParams } = new URL(request.url);
  return {
    page: parsePaginationNumber(searchParams.get("page"), 1, 1, 9999),
    pageSize: parsePaginationNumber(searchParams.get("pageSize"), 20, 5, 200)
  };
};

const endpointFilterCache = new Map<string, { expiresAt: number; value: unknown }>();

const endpointCacheKey = (user: RbacUser, endpoint: string, filters: PmDashboardFilters) =>
  `${contextCacheKey(user)}::${endpoint}::${filterCacheKey(filters)}`;

const readEndpointCache = <T>(key: string): T | null => {
  const cached = endpointFilterCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    endpointFilterCache.delete(key);
    return null;
  }
  return cached.value as T;
};

const writeEndpointCache = <T>(key: string, value: T) => {
  endpointFilterCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value
  });
};

export const getPmDashboardSummary = async (user: RbacUser, rawFilters: Partial<PmDashboardFilters>) => {
  const filters = normalizePmFilters(rawFilters);
  const key = endpointCacheKey(user, "summary", filters);
  const cached = readEndpointCache<PmSummaryResponse>(key);
  if (cached) {
    return cached;
  }

  const ctx = await getFilteredContext(user, filters);
  const summary = buildSummary(ctx);
  writeEndpointCache(key, summary);
  return summary;
};

export const getPmDashboardProjects = async (
  user: RbacUser,
  rawFilters: Partial<PmDashboardFilters>,
  page: number,
  pageSize: number
) => {
  const filters = normalizePmFilters(rawFilters);
  const key = `${endpointCacheKey(user, "projects", filters)}::${page}::${pageSize}`;
  const cached = readEndpointCache<PmProjectsResponse>(key);
  if (cached) {
    return cached;
  }

  const ctx = await getFilteredContext(user, filters);
  const payload = buildProjects(ctx, page, pageSize);
  writeEndpointCache(key, payload);
  return payload;
};

export const getPmDashboardStageHealthCharts = async (user: RbacUser, rawFilters: Partial<PmDashboardFilters>) => {
  const filters = normalizePmFilters(rawFilters);
  const key = endpointCacheKey(user, "stage-health", filters);
  const cached = readEndpointCache<PmStageHealthChartResponse>(key);
  if (cached) {
    return cached;
  }

  const ctx = await getFilteredContext(user, filters);
  const payload = buildStageHealthCharts(ctx);
  writeEndpointCache(key, payload);
  return payload;
};

export const getPmDashboardSlaCharts = async (user: RbacUser, rawFilters: Partial<PmDashboardFilters>) => {
  const filters = normalizePmFilters(rawFilters);
  const key = endpointCacheKey(user, "sla", filters);
  const cached = readEndpointCache<PmSlaChartResponse>(key);
  if (cached) {
    return cached;
  }

  const ctx = await getFilteredContext(user, filters);
  const payload = buildSlaCharts(ctx);
  writeEndpointCache(key, payload);
  return payload;
};

export const getPmDashboardScheduleCharts = async (user: RbacUser, rawFilters: Partial<PmDashboardFilters>) => {
  const filters = normalizePmFilters(rawFilters);
  const key = endpointCacheKey(user, "schedule", filters);
  const cached = readEndpointCache<PmScheduleChartResponse>(key);
  if (cached) {
    return cached;
  }

  const ctx = await getFilteredContext(user, filters);
  const payload = buildScheduleCharts(ctx);
  writeEndpointCache(key, payload);
  return payload;
};

export const getPmDashboardRiskCharts = async (user: RbacUser, rawFilters: Partial<PmDashboardFilters>) => {
  const filters = normalizePmFilters(rawFilters);
  const key = endpointCacheKey(user, "risks", filters);
  const cached = readEndpointCache<PmRiskChartsResponse>(key);
  if (cached) {
    return cached;
  }

  const ctx = await getFilteredContext(user, filters);
  const payload = buildRiskCharts(ctx);
  writeEndpointCache(key, payload);
  return payload;
};

export const getPmDashboardResourceCharts = async (user: RbacUser, rawFilters: Partial<PmDashboardFilters>) => {
  const filters = normalizePmFilters(rawFilters);
  const key = endpointCacheKey(user, "resources", filters);
  const cached = readEndpointCache<PmResourcesChartsResponse>(key);
  if (cached) {
    return cached;
  }

  const ctx = await getFilteredContext(user, filters);
  const payload = buildResourcesCharts(ctx);
  writeEndpointCache(key, payload);
  return payload;
};

export const getPmDashboardDrilldown = async (
  user: RbacUser,
  projectId: string,
  rawFilters: Partial<PmDashboardFilters> = defaultPmFilters
): Promise<PmDrilldownResponse | null> => {
  const filters = normalizePmFilters(rawFilters);
  const key = `${endpointCacheKey(user, "drilldown", filters)}::${projectId}`;
  const cached = readEndpointCache<PmDrilldownResponse | null>(key);
  if (cached !== null) {
    return cached;
  }

  const ctx = await getFilteredContext(user, filters);
  const payload = await buildDrilldown(ctx, projectId);
  writeEndpointCache(key, payload);
  return payload;
};

export const getPmDashboardDatasetForTests = async (submissions: ProjectSubmission[], user: RbacUser) => {
  const visibleSubmissions = filterSubmissionsByAccess(user, submissions, "dashboard");
  return buildDataset(visibleSubmissions);
};

export const buildPmSummaryForTests = async (
  submissions: ProjectSubmission[],
  user: RbacUser,
  filters: Partial<PmDashboardFilters> = defaultPmFilters
) => {
  const ctx = await getFilteredContextFromSubmissions(submissions, user, filters);
  return buildSummary(ctx);
};

export const buildPmProjectsForTests = async (
  submissions: ProjectSubmission[],
  user: RbacUser,
  filters: Partial<PmDashboardFilters> = defaultPmFilters
) => {
  const ctx = await getFilteredContextFromSubmissions(submissions, user, filters);
  return buildProjects(ctx, 1, 200);
};
