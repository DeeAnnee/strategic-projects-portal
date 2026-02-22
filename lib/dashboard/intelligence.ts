import type { ProjectCategory, ProjectStage, ProjectStatus, ProjectSubmission } from "@/lib/submissions/types";

export type DashboardLayerKey =
  | "operational"
  | "strategic"
  | "analytical"
  | "tactical"
  | "contextual";

export type DashboardLayer = {
  key: DashboardLayerKey;
  label: string;
  description: string;
};

export type DashboardFilters = {
  search: string;
  businessUnit: string;
  stage: string;
  category: string;
};

export type DistributionItem = {
  label: string;
  value: number;
  pct: number;
};

export type TimelinePoint = {
  month: string;
  volume: number;
  value: number;
};

export type IncrementalYearPoint = {
  year: number;
  revenue: number;
  savedCosts: number;
  addlOperatingCosts: number;
  net: number;
};

export type WatchlistItem = {
  id: string;
  title: string;
  stage: ProjectStage;
  status: ProjectStatus;
  businessUnit: string;
  priority: string;
  riskLevel: string;
  expectedValue: number;
  paybackYears: number;
  dependencyCount: number;
  ownerName: string;
};

export type DashboardModel = {
  totals: {
    totalProjects: number;
    inReview: number;
    approved: number;
    activePrograms: number;
    savingsPipeline: number;
    totalInvestment: number;
    avgPaybackYears: number;
    slaRiskCount: number;
  };
  distributions: {
    byStage: DistributionItem[];
    byStatus: DistributionItem[];
    byCategory: DistributionItem[];
    byBusinessUnit: DistributionItem[];
  };
  timeline: TimelinePoint[];
  incrementalByYear: IncrementalYearPoint[];
  watchlist: WatchlistItem[];
  tactical: {
    sponsorApprovalRate: number;
    fundingConversionRate: number;
    governanceCompletionRate: number;
    liveDeliveryRate: number;
  };
  contextual: {
    projectMap: Map<string, ProjectSubmission>;
    projectOrder: string[];
  };
};

export const STAGE_ORDER: ProjectStage[] = [
  "Placemat Proposal",
  "Sponsor Approval",
  "PGO & Finance Review",
  "SPO Committee Review",
  "Funding Request",
  "Live Project",
  "Change Request"
];

export const STATUS_ORDER: ProjectStatus[] = [
  "Draft",
  "Submitted",
  "Sent for Approval",
  "At SPO Review",
  "Approved",
  "Rejected",
  "Returned to Submitter",
  "Deferred",
  "Cancelled"
];

export const DASHBOARD_LAYERS: DashboardLayer[] = [
  {
    key: "operational",
    label: "Operational Dashboard",
    description: "Real-time operational health across active review and execution queues."
  },
  {
    key: "strategic",
    label: "Strategic Dashboard",
    description: "Executive trajectory of value, investment, and long-horizon portfolio shape."
  },
  {
    key: "analytical",
    label: "Analytical Dashboard",
    description: "Deep-dive insights and scenario modelling for decision support."
  },
  {
    key: "tactical",
    label: "Tactical Dashboard",
    description: "Goal tracking across approvals, governance gates, and funding progression."
  },
  {
    key: "contextual",
    label: "Contextual Project Dashboard",
    description: "Project-level context, timeline signal, and dependency visibility."
  }
];

const REVIEW_STATUSES: ProjectStatus[] = ["Submitted", "Sent for Approval", "At SPO Review"];
const ACTIVE_STAGES: ProjectStage[] = [
  "Sponsor Approval",
  "PGO & Finance Review",
  "SPO Committee Review",
  "Funding Request",
  "Live Project",
  "Change Request"
];

const priorityScore: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1
};

const riskScore: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1
};

const monthLabel = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

const getExpectedValue = (submission: ProjectSubmission) => {
  const runRate = submission.financials.runRateSavings ?? 0;
  const costSavings = submission.benefits?.costSaveEst ?? 0;
  const uplift = submission.benefits?.revenueUpliftEst ?? 0;
  return runRate + costSavings + uplift;
};

const getInvestment = (submission: ProjectSubmission) =>
  (submission.financials.capex ?? 0) + (submission.financials.oneTimeCosts ?? 0);

const getPaybackYears = (submission: ProjectSubmission) => {
  if (typeof submission.financials.paybackYears === "number") return submission.financials.paybackYears;
  if (typeof submission.financials.paybackMonths === "number") return submission.financials.paybackMonths / 12;
  return 0;
};

const toDistribution = (
  map: Map<string, number>,
  total: number,
  order?: readonly string[]
): DistributionItem[] => {
  const ordered = order
    ? order.filter((label) => map.has(label)).map((label) => [label, map.get(label) ?? 0] as const)
    : [];
  const remainder = [...map.entries()]
    .filter(([label]) => !order?.includes(label))
    .sort((a, b) => b[1] - a[1]);

  return [...ordered, ...remainder].map(([label, value]) => ({
    label,
    value,
    pct: total > 0 ? Math.round((value / total) * 100) : 0
  }));
};

const safeDate = (value: string | undefined) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86_400_000);

export const applyDashboardFilters = (
  submissions: ProjectSubmission[],
  filters: DashboardFilters
): ProjectSubmission[] => {
  const search = filters.search.trim().toLowerCase();

  return submissions.filter((submission) => {
    if (filters.businessUnit !== "All" && submission.businessUnit !== filters.businessUnit) return false;
    if (filters.stage !== "All" && submission.stage !== filters.stage) return false;
    if (filters.category !== "All" && submission.category !== filters.category) return false;

    if (!search) return true;
    return (
      submission.id.toLowerCase().includes(search) ||
      submission.title.toLowerCase().includes(search) ||
      submission.ownerName.toLowerCase().includes(search)
    );
  });
};

export const getFilterOptions = (submissions: ProjectSubmission[]) => {
  const businessUnits = Array.from(new Set(submissions.map((item) => item.businessUnit))).sort((a, b) =>
    a.localeCompare(b)
  );
  const stages = Array.from(new Set(submissions.map((item) => item.stage))).sort((a, b) =>
    STAGE_ORDER.indexOf(a as ProjectStage) - STAGE_ORDER.indexOf(b as ProjectStage)
  );
  const categories = Array.from(new Set(submissions.map((item) => item.category))).sort((a, b) =>
    a.localeCompare(b)
  );

  return {
    businessUnits,
    stages,
    categories
  };
};

export const buildDashboardModel = (submissions: ProjectSubmission[]): DashboardModel => {
  const totalProjects = submissions.length;
  const inReview = submissions.filter((item) => REVIEW_STATUSES.includes(item.status)).length;
  const approved = submissions.filter((item) => item.status === "Approved").length;
  const activePrograms = submissions.filter((item) => ACTIVE_STAGES.includes(item.stage)).length;
  const savingsPipeline = submissions.reduce((sum, item) => sum + getExpectedValue(item), 0);
  const totalInvestment = submissions.reduce((sum, item) => sum + getInvestment(item), 0);

  const paybackValues = submissions
    .map((item) => getPaybackYears(item))
    .filter((value) => Number.isFinite(value) && value > 0);
  const avgPaybackYears =
    paybackValues.length > 0
      ? paybackValues.reduce((sum, value) => sum + value, 0) / paybackValues.length
      : 0;

  const now = new Date();
  const slaRiskCount = submissions.filter((item) => {
    const isSponsorQueue = item.stage === "Sponsor Approval" || item.status === "Sent for Approval";
    const updated = safeDate(item.updatedAt);
    if (!isSponsorQueue || !updated) return false;
    return daysBetween(updated, now) > 7;
  }).length;

  const stageCounts = submissions.reduce((map, item) => {
    map.set(item.stage, (map.get(item.stage) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const statusCounts = submissions.reduce((map, item) => {
    map.set(item.status, (map.get(item.status) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const categoryCounts = submissions.reduce((map, item) => {
    map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const businessUnitCounts = submissions.reduce((map, item) => {
    map.set(item.businessUnit, (map.get(item.businessUnit) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const byStage = toDistribution(stageCounts, totalProjects, STAGE_ORDER);
  const byStatus = toDistribution(statusCounts, totalProjects, STATUS_ORDER);
  const byCategory = toDistribution(categoryCounts, totalProjects, ["Technology", "Premise", "Other"]);
  const byBusinessUnit = toDistribution(businessUnitCounts, totalProjects);

  const monthWindow = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - offset), 1);
    return { key: `${date.getFullYear()}-${date.getMonth()}`, month: monthLabel(date), volume: 0, value: 0 };
  });
  const monthIndex = new Map(monthWindow.map((entry, index) => [entry.key, index]));

  submissions.forEach((item) => {
    const created = safeDate(item.createdAt);
    if (!created) return;
    const key = `${created.getFullYear()}-${created.getMonth()}`;
    const index = monthIndex.get(key);
    if (index === undefined) return;

    monthWindow[index].volume += 1;
    monthWindow[index].value += getExpectedValue(item);
  });

  const yearly = new Map<number, IncrementalYearPoint>();
  submissions.forEach((item) => {
    const years = item.financialGrid?.incremental?.years ?? [];
    const revenue = item.financialGrid?.incremental?.revenue ?? [];
    const savedCosts = item.financialGrid?.incremental?.savedCosts ?? [];
    const addlOperatingCosts = item.financialGrid?.incremental?.addlOperatingCosts ?? [];

    years.forEach((year, index) => {
      const current = yearly.get(year) ?? {
        year,
        revenue: 0,
        savedCosts: 0,
        addlOperatingCosts: 0,
        net: 0
      };
      current.revenue += revenue[index] ?? 0;
      current.savedCosts += savedCosts[index] ?? 0;
      current.addlOperatingCosts += addlOperatingCosts[index] ?? 0;
      current.net = current.revenue - (current.savedCosts + current.addlOperatingCosts);
      yearly.set(year, current);
    });
  });

  const incrementalByYear = Array.from(yearly.values()).sort((a, b) => a.year - b.year);

  const watchlist = submissions
    .slice()
    .sort((a, b) => {
      const aScore = (riskScore[a.riskLevel] ?? 0) * 10 + (priorityScore[a.priority] ?? 0);
      const bScore = (riskScore[b.riskLevel] ?? 0) * 10 + (priorityScore[b.priority] ?? 0);
      if (bScore !== aScore) return bScore - aScore;
      return getExpectedValue(b) - getExpectedValue(a);
    })
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      title: item.title,
      stage: item.stage,
      status: item.status,
      businessUnit: item.businessUnit,
      priority: item.priority,
      riskLevel: item.riskLevel,
      expectedValue: getExpectedValue(item),
      paybackYears: getPaybackYears(item),
      dependencyCount: item.dependencies.length,
      ownerName: item.ownerName
    }));

  const sponsorApproved = submissions.filter((item) => item.workflow.sponsorDecision === "Approved").length;
  const sponsorEligible = submissions.filter((item) =>
    ["Sponsor Approval", "PGO & Finance Review", "SPO Committee Review", "Funding Request", "Live Project", "Change Request"].includes(
      item.stage
    )
  ).length;

  const fundingReady = submissions.filter((item) =>
    item.stage === "Funding Request" || item.stage === "Live Project"
  ).length;
  const governanceComplete = submissions.filter(
    (item) =>
      item.workflow.pgoDecision === "Approved" &&
      item.workflow.financeDecision === "Approved"
  ).length;
  const liveDelivered = submissions.filter((item) => item.stage === "Live Project").length;

  const projectMap = new Map(submissions.map((item) => [item.id, item]));
  const projectOrder = submissions
    .slice()
    .sort((a, b) => {
      const aDate = safeDate(a.updatedAt)?.getTime() ?? 0;
      const bDate = safeDate(b.updatedAt)?.getTime() ?? 0;
      return bDate - aDate;
    })
    .map((item) => item.id);

  return {
    totals: {
      totalProjects,
      inReview,
      approved,
      activePrograms,
      savingsPipeline,
      totalInvestment,
      avgPaybackYears,
      slaRiskCount
    },
    distributions: {
      byStage,
      byStatus,
      byCategory,
      byBusinessUnit
    },
    timeline: monthWindow.map(({ month, volume, value }) => ({ month, volume, value })),
    incrementalByYear,
    watchlist,
    tactical: {
      sponsorApprovalRate: sponsorEligible > 0 ? Math.round((sponsorApproved / sponsorEligible) * 100) : 0,
      fundingConversionRate: totalProjects > 0 ? Math.round((fundingReady / totalProjects) * 100) : 0,
      governanceCompletionRate: totalProjects > 0 ? Math.round((governanceComplete / totalProjects) * 100) : 0,
      liveDeliveryRate: totalProjects > 0 ? Math.round((liveDelivered / totalProjects) * 100) : 0
    },
    contextual: {
      projectMap,
      projectOrder
    }
  };
};

export const stageProgressPct = (stage: ProjectStage): number => {
  const index = STAGE_ORDER.indexOf(stage);
  if (index < 0) return 0;
  return Math.round((index / (STAGE_ORDER.length - 1)) * 100);
};

export const categoryTheme = (category: ProjectCategory) => {
  if (category === "Technology") return "bg-rose-100 text-rose-700";
  if (category === "Premise") return "bg-amber-100 text-amber-700";
  return "bg-slate-200 text-slate-700";
};
