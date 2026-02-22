"use client";

import { useEffect, useMemo, useState } from "react";

import ChartCard from "@/components/project-management/chart-card";
import ChangeManagementTab from "@/components/project-management/change-management-tab";
import DrilldownDrawer from "@/components/project-management/drilldown-drawer";
import FilterBar from "@/components/project-management/filter-bar";
import KpiCards from "@/components/project-management/kpi-cards";
import type { Role } from "@/lib/auth/roles";
import type {
  PmDashboardFilters,
  PmDrilldownResponse,
  PmProjectsResponse,
  PmResourcesChartsResponse,
  PmRiskChartsResponse,
  PmScheduleChartResponse,
  PmSlaChartResponse,
  PmStageHealthChartResponse,
  PmSummaryResponse
} from "@/lib/pm-dashboard/types";

type Props = {
  canAssignProjectManagers?: boolean;
};

type PortalUserOption = {
  id: string;
  name: string;
  email: string;
  roleType: Role;
  role: Role;
  isActive?: boolean;
};

const tabs = [
  "Portfolio Overview",
  "Schedule & Milestones",
  "SLA & Throughput",
  "Risks, Issues, Dependencies",
  "Resources & Workload",
  "Benefits & Value Tracking",
  "Change Management",
  "Project Drilldown"
] as const;

type TabKey = (typeof tabs)[number];

const defaultSummary: PmSummaryResponse = {
  lastRefreshedAt: "",
  kpis: {
    totalActiveProjects: 0,
    onTrackPct: 0,
    atRiskCount: 0,
    slaCompliancePct: 0,
    avgCycleTimeDays: 0,
    overdueMilestones: 0,
    overdueTasks: 0
  },
  changeWidgets: {
    projectsWithActiveChanges: 0,
    changeRequestsByStatus: [],
    totalBudgetImpact: 0,
    scheduleImpactTrend: [],
    avgChangeApprovalTimeHours: 0,
    projectsWithMoreThan3Changes: []
  },
  filters: {
    stages: ["All"],
    statuses: ["All"],
    health: ["All", "Green", "Amber", "Red"],
    sponsors: ["All"],
    projectManagers: ["All"],
    businessUnits: ["All"]
  },
  attentionRequired: []
};

const defaultProjects: PmProjectsResponse = {
  page: 1,
  pageSize: 20,
  total: 0,
  data: []
};

const defaultStageHealth: PmStageHealthChartResponse = {
  byStage: [],
  byHealth: [],
  statusTrend: [],
  bottlenecks: []
};

const defaultSla: PmSlaChartResponse = {
  agingBuckets: [],
  complianceTrend: [],
  cycleDistribution: [],
  throughput: [],
  stepDurations: []
};

const defaultSchedule: PmScheduleChartResponse = {
  timeline: [],
  milestoneBurndown: [],
  milestones: []
};

const defaultRisks: PmRiskChartsResponse = {
  heatmap: [],
  criticalItems: [],
  trend: []
};

const defaultResources: PmResourcesChartsResponse = {
  workload14: [],
  workload30: [],
  capacity: [],
  table: []
};

const healthColor: Record<string, string> = {
  Green: "bg-emerald-500",
  Amber: "bg-amber-500",
  Red: "bg-rose-600"
};

const formatNumber = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const formatMoney = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

const filterDefaults: PmDashboardFilters = {
  search: "",
  stage: "All",
  status: "All",
  health: "All",
  sponsor: "All",
  projectManager: "All",
  businessUnit: "All",
  dateFrom: "",
  dateTo: ""
};

const buildQueryString = (filters: PmDashboardFilters, page?: number, pageSize?: number) => {
  const params = new URLSearchParams();

  const append = (key: keyof PmDashboardFilters, value: string) => {
    const trimmed = value.trim();
    if (trimmed.length > 0 && trimmed !== "All") {
      params.set(key, trimmed);
    }
  };

  append("search", filters.search);
  append("stage", filters.stage);
  append("status", filters.status);
  append("health", filters.health);
  append("sponsor", filters.sponsor);
  append("projectManager", filters.projectManager);
  append("businessUnit", filters.businessUnit);
  append("dateFrom", filters.dateFrom);
  append("dateTo", filters.dateTo);

  if (page) {
    params.set("page", String(page));
  }
  if (pageSize) {
    params.set("pageSize", String(pageSize));
  }

  return params.toString();
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const raw = await response.text();
  let payload: { data?: T; message?: string } | null = null;

  if (raw.trim().length > 0) {
    try {
      payload = JSON.parse(raw) as { data?: T; message?: string };
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const fallbackMessage =
      payload?.message ??
      `${response.status} ${response.statusText || "Failed to load dashboard data."}`;
    throw new Error(fallbackMessage);
  }

  if (!payload?.data) {
    throw new Error("Dashboard response was empty.");
  }
  return payload.data;
};

export default function PmExecutiveDashboard({ canAssignProjectManagers = false }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("Portfolio Overview");
  const [filters, setFilters] = useState<PmDashboardFilters>(filterDefaults);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

  const [summary, setSummary] = useState<PmSummaryResponse>(defaultSummary);
  const [projects, setProjects] = useState<PmProjectsResponse>(defaultProjects);
  const [stageHealth, setStageHealth] = useState<PmStageHealthChartResponse>(defaultStageHealth);
  const [slaCharts, setSlaCharts] = useState<PmSlaChartResponse>(defaultSla);
  const [scheduleCharts, setScheduleCharts] = useState<PmScheduleChartResponse>(defaultSchedule);
  const [riskCharts, setRiskCharts] = useState<PmRiskChartsResponse>(defaultRisks);
  const [resourceCharts, setResourceCharts] = useState<PmResourcesChartsResponse>(defaultResources);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownData, setDrilldownData] = useState<PmDrilldownResponse | null>(null);
  const [portalUsers, setPortalUsers] = useState<PortalUserOption[]>([]);
  const [assignmentProjectId, setAssignmentProjectId] = useState("");
  const [assignmentManagerEmail, setAssignmentManagerEmail] = useState("");
  const [assigningManager, setAssigningManager] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const normalizedFilters = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch
    }),
    [filters, debouncedSearch]
  );

  useEffect(() => {
    let active = true;
    const query = buildQueryString(normalizedFilters, page, pageSize);

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [summaryData, projectsData, stageHealthData, slaData, scheduleData, risksData, resourcesData] =
          await Promise.all([
            fetchJson<PmSummaryResponse>(`/api/pm-dashboard/summary?${query}`),
            fetchJson<PmProjectsResponse>(`/api/pm-dashboard/projects?${query}`),
            fetchJson<PmStageHealthChartResponse>(`/api/pm-dashboard/charts/stage-health?${query}`),
            fetchJson<PmSlaChartResponse>(`/api/pm-dashboard/charts/sla?${query}`),
            fetchJson<PmScheduleChartResponse>(`/api/pm-dashboard/charts/schedule?${query}`),
            fetchJson<PmRiskChartsResponse>(`/api/pm-dashboard/charts/risks?${query}`),
            fetchJson<PmResourcesChartsResponse>(`/api/pm-dashboard/charts/resources?${query}`)
          ]);

        if (!active) return;
        setSummary(summaryData);
        setProjects(projectsData);
        setStageHealth(stageHealthData);
        setSlaCharts(slaData);
        setScheduleCharts(scheduleData);
        setRiskCharts(risksData);
        setResourceCharts(resourcesData);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load PM dashboard.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [normalizedFilters, page, pageSize]);

  useEffect(() => {
    if (!canAssignProjectManagers) {
      return;
    }

    const loadPortalUsers = async () => {
      try {
        const response = await fetch("/api/portal-users");
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        setPortalUsers(Array.isArray(payload.data) ? payload.data : []);
      } catch {
        // Keep assignment section usable even if users cannot be loaded.
      }
    };

    void loadPortalUsers();
  }, [canAssignProjectManagers]);

  const managerOptions = useMemo(() => {
    const allowedRoles = new Set<Role>([
      "PROJECT_MANAGEMENT_HUB_ADMIN",
      "PROJECT_MANAGEMENT_HUB_BASIC_USER",
      "ADMIN"
    ]);

    return portalUsers
      .filter((user) => user.isActive !== false && allowedRoles.has(user.roleType))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [portalUsers]);

  useEffect(() => {
    if (!canAssignProjectManagers) {
      return;
    }

    if (!assignmentProjectId && projects.data.length > 0) {
      setAssignmentProjectId(projects.data[0]?.projectId ?? "");
    }
  }, [assignmentProjectId, canAssignProjectManagers, projects.data]);

  const selectedAssignmentProject = useMemo(
    () => projects.data.find((project) => project.projectId === assignmentProjectId) ?? null,
    [assignmentProjectId, projects.data]
  );

  const assignProjectManager = async () => {
    if (!assignmentProjectId) {
      setAssignmentError("Select a project first.");
      setAssignmentMessage(null);
      return;
    }

    if (!assignmentManagerEmail) {
      setAssignmentError("Select a project manager.");
      setAssignmentMessage(null);
      return;
    }

    const selectedManager = managerOptions.find((user) => user.email === assignmentManagerEmail);
    if (!selectedManager) {
      setAssignmentError("Selected project manager is unavailable.");
      setAssignmentMessage(null);
      return;
    }

    setAssigningManager(true);
    setAssignmentError(null);
    setAssignmentMessage(null);

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(assignmentProjectId)}/assign-project-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerName: selectedManager.name,
          managerEmail: selectedManager.email
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to assign project manager.");
      }

      setProjects((prev) => ({
        ...prev,
        data: prev.data.map((project) =>
          project.projectId === assignmentProjectId
            ? { ...project, projectManager: selectedManager.name, projectManagerEmail: selectedManager.email }
            : project
        )
      }));

      setAssignmentMessage(
        `Assignment request sent to ${selectedManager.name}. Project moves to Live only after PM approval in Approvals.`
      );
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : "Unable to assign project manager.");
    } finally {
      setAssigningManager(false);
    }
  };

  const openDrilldown = async (projectId: string) => {
    setDrilldownOpen(true);
    setDrilldownLoading(true);
    setDrilldownData(null);

    try {
      const query = buildQueryString(normalizedFilters);
      const data = await fetchJson<PmDrilldownResponse>(`/api/pm-dashboard/project/${encodeURIComponent(projectId)}?${query}`);
      setDrilldownData(data);
      setActiveTab("Project Drilldown");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load project drilldown.");
    } finally {
      setDrilldownLoading(false);
    }
  };

  const onExport = (format: "pdf" | "excel" | "ppt") => {
    if (typeof window === "undefined") return;

    if (format === "pdf") {
      window.open("/api/reports/pdf", "_blank", "noopener,noreferrer");
      return;
    }

    if (format === "excel") {
      window.open("/api/reports/excel", "_blank", "noopener,noreferrer");
      return;
    }

    window.open("/api/reports/powerpoint", "_blank", "noopener,noreferrer");
  };

  const updateFilter = (key: keyof PmDashboardFilters, value: string) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setPage(1);
    setFilters(filterDefaults);
    setDebouncedSearch("");
  };

  const maxBottleneck = Math.max(1, ...stageHealth.bottlenecks.map((item) => item.avgDays));
  const maxThroughput = Math.max(1, ...slaCharts.throughput.map((item) => item.approvalsCompleted));
  const maxWorkload = Math.max(
    1,
    ...resourceCharts.workload30.map((row) => row.tasksDue),
    ...resourceCharts.workload14.map((row) => row.tasksDue)
  );

  const maxBenefit = Math.max(
    1,
    ...projects.data.map((row) => Math.max(row.benefitsTargetTotal, row.benefitsRealizedToDate))
  );

  const maxBudget = Math.max(1, ...projects.data.map((row) => Math.max(row.budgetApproved, row.spendToDate)));

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-brand-100 bg-gradient-to-r from-white to-brand-50/40 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Project Management Hub</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">Executive Project Management Dashboard</h2>
        <p className="mt-1 text-sm text-slate-600">
          Portfolio-level and project-level operational analytics with SLA intelligence, schedule health, risk exposure, and value delivery tracking.
        </p>
      </section>

      <FilterBar
        filters={filters}
        options={summary.filters}
        isLoading={loading}
        lastRefreshedAt={summary.lastRefreshedAt}
        onFilterChange={updateFilter}
        onReset={resetFilters}
        onExport={onExport}
      />

      <KpiCards kpis={summary.kpis} isLoading={loading} />

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                activeTab === tab ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {activeTab === "Portfolio Overview" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <ChartCard
            title="Projects by Stage"
            subtitle="Click a segment to drill filter by stage"
            className="xl:col-span-1"
          >
            {stageHealth.byStage.length === 0 ? (
              <p className="text-sm text-slate-500">No stage distribution available.</p>
            ) : (
              <div className="space-y-2">
                {stageHealth.byStage.map((row) => {
                  const total = stageHealth.byStage.reduce((sum, item) => sum + item.count, 0) || 1;
                  const pct = Math.round((row.count / total) * 100);
                  return (
                    <button
                      key={row.stage}
                      type="button"
                      onClick={() => updateFilter("stage", row.stage)}
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
                    >
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                        <span>{row.stage}</span>
                        <span>
                          {row.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200">
                        <div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Projects by Health (RAG)" subtitle="Click to filter by health" className="xl:col-span-1">
            {stageHealth.byHealth.length === 0 ? (
              <p className="text-sm text-slate-500">No health distribution available.</p>
            ) : (
              <div className="space-y-2">
                {stageHealth.byHealth.map((row) => {
                  const total = stageHealth.byHealth.reduce((sum, item) => sum + item.count, 0) || 1;
                  const pct = Math.round((row.count / total) * 100);
                  return (
                    <button
                      key={row.health}
                      type="button"
                      onClick={() => updateFilter("health", row.health)}
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
                    >
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${healthColor[row.health] ?? "bg-slate-400"}`} />
                          {row.health}
                        </span>
                        <span>
                          {row.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200">
                        <div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Projects by Status Over Time" subtitle="Monthly trend (stacked by status)">
            {stageHealth.statusTrend.length === 0 ? (
              <p className="text-sm text-slate-500">No status trend available.</p>
            ) : (
              <div className="space-y-2">
                {stageHealth.statusTrend.map((month) => {
                  const total = Object.values(month.totals).reduce((sum, value) => sum + value, 0);
                  const entries = Object.entries(month.totals);
                  return (
                    <div key={month.month} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                        <span>{month.month}</span>
                        <span>{total}</span>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-slate-200">
                        {entries.map(([status, count]) => {
                          const width = total === 0 ? 0 : (count / total) * 100;
                          return (
                            <div
                              key={`${month.month}-${status}`}
                              title={`${status}: ${count}`}
                              className="h-2"
                              style={{
                                width: `${width}%`,
                                backgroundColor:
                                  status === "Approved"
                                    ? "#15803d"
                                    : status === "Draft"
                                      ? "#b91c1c"
                                      : status === "Sent for Approval"
                                        ? "#d97706"
                                        : "#64748b"
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Top Bottlenecks" subtitle="Average days by workflow step">
            <div className="space-y-2">
              {stageHealth.bottlenecks.map((row) => (
                <div key={row.step}>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                    <span>{row.step}</span>
                    <span>{formatNumber(row.avgDays)} days</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(row.avgDays / maxBottleneck) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard
            title="Attention Required"
            subtitle="SLA breaches, overdue milestones, and critical risk concentration"
            className="xl:col-span-2"
          >
            {summary.attentionRequired.length === 0 ? (
              <p className="text-sm text-slate-500">No projects currently require escalation.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-2 py-2 text-left">Project</th>
                      <th className="px-2 py-2 text-left">PM</th>
                      <th className="px-2 py-2 text-left">Stage</th>
                      <th className="px-2 py-2 text-left">Health</th>
                      <th className="px-2 py-2 text-right">SLA Days</th>
                      <th className="px-2 py-2 text-left">Next Milestone</th>
                      <th className="px-2 py-2 text-right">Days Overdue</th>
                      <th className="px-2 py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.attentionRequired.map((row) => (
                      <tr key={row.projectId} className="border-t border-slate-100">
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              void openDrilldown(row.projectId);
                            }}
                            className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2"
                          >
                            {row.projectId}
                          </button>
                        </td>
                        <td className="px-2 py-2">{row.projectManager}</td>
                        <td className="px-2 py-2">{row.stage}</td>
                        <td className="px-2 py-2">{row.health}</td>
                        <td className="px-2 py-2 text-right">{formatNumber(row.slaDays)}</td>
                        <td className="px-2 py-2">{row.nextMilestone}</td>
                        <td className="px-2 py-2 text-right">{row.daysOverdue}</td>
                        <td className="px-2 py-2">{row.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        </section>
      ) : null}

      {activeTab === "Schedule & Milestones" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Planned vs Forecast Timeline" subtitle="Simplified Gantt-like slippage view" className="xl:col-span-2">
            {scheduleCharts.timeline.length === 0 ? (
              <p className="text-sm text-slate-500">No schedule data available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-2 py-2 text-left">Project</th>
                      <th className="px-2 py-2 text-left">Planned Start</th>
                      <th className="px-2 py-2 text-left">Planned End</th>
                      <th className="px-2 py-2 text-left">Forecast Start</th>
                      <th className="px-2 py-2 text-left">Forecast End</th>
                      <th className="px-2 py-2 text-right">Variance (days)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleCharts.timeline.map((row) => (
                      <tr key={row.projectId} className="border-t border-slate-100">
                        <td className="px-2 py-2">{row.project}</td>
                        <td className="px-2 py-2">{row.plannedStart}</td>
                        <td className="px-2 py-2">{row.plannedEnd}</td>
                        <td className="px-2 py-2">{row.forecastStart}</td>
                        <td className="px-2 py-2">{row.forecastEnd}</td>
                        <td className={`px-2 py-2 text-right ${row.varianceDays > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                          {row.varianceDays}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Milestone Burndown" subtitle="Planned vs completed by month">
            {scheduleCharts.milestoneBurndown.length === 0 ? (
              <p className="text-sm text-slate-500">No milestone burndown data.</p>
            ) : (
              <div className="space-y-2">
                {scheduleCharts.milestoneBurndown.map((row) => {
                  const max = Math.max(row.planned, row.completed, 1);
                  return (
                    <div key={row.month} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-700">{row.month}</p>
                      <div className="mt-1 grid gap-1">
                        <div>
                          <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                            <span>Planned</span>
                            <span>{row.planned}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200">
                            <div className="h-2 rounded-full bg-slate-500" style={{ width: `${(row.planned / max) * 100}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                            <span>Completed</span>
                            <span>{row.completed}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200">
                            <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(row.completed / max) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Milestone Table" subtitle="Overdue and next 30-day milestones" className="xl:col-span-1">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left">Project</th>
                    <th className="px-2 py-2 text-left">Milestone</th>
                    <th className="px-2 py-2 text-left">Planned</th>
                    <th className="px-2 py-2 text-left">Forecast</th>
                    <th className="px-2 py-2 text-right">Days Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleCharts.milestones.slice(0, 20).map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-2 py-2">{row.project}</td>
                      <td className="px-2 py-2">{row.name}</td>
                      <td className="px-2 py-2">{row.plannedDate}</td>
                      <td className="px-2 py-2">{row.forecastDate}</td>
                      <td className={`px-2 py-2 text-right ${row.daysOverdue > 0 ? "text-rose-700" : "text-slate-500"}`}>
                        {row.daysOverdue}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </section>
      ) : null}

      {activeTab === "SLA & Throughput" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Approvals Pending Aging" subtitle="Bucketed pending approvals">
            <div className="space-y-2">
              {slaCharts.agingBuckets.map((row) => (
                <div key={row.bucket}>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                    <span>{row.bucket}</span>
                    <span>{row.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.min(100, row.count * 12)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="SLA Compliance Trend" subtitle="Within SLA by month">
            <div className="space-y-2">
              {slaCharts.complianceTrend.map((row) => (
                <div key={row.month} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                    <span>{row.month}</span>
                    <span>{formatNumber(row.compliancePct)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div className="h-2 rounded-full bg-brand-600" style={{ width: `${row.compliancePct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="Cycle Time Distribution" subtitle="Median/avg outlier buckets">
            <div className="space-y-2">
              {slaCharts.cycleDistribution.map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-700">{row.label} days</span>
                  <span className="font-semibold text-slate-900">{row.value}</span>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="Approvals Throughput" subtitle="Completed approvals per month">
            <div className="space-y-2">
              {slaCharts.throughput.map((row) => (
                <div key={row.month}>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                    <span>{row.month}</span>
                    <span>{row.approvalsCompleted}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-brand-600"
                      style={{ width: `${(row.approvalsCompleted / maxThroughput) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        </section>
      ) : null}

      {activeTab === "Risks, Issues, Dependencies" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Risk Heatmap" subtitle="Probability vs impact-area concentration">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left">Probability</th>
                    <th className="px-2 py-2 text-left">Impact Area</th>
                    <th className="px-2 py-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {riskCharts.heatmap.map((row) => (
                    <tr key={`${row.probability}-${row.impactArea}`} className="border-t border-slate-100">
                      <td className="px-2 py-2">{row.probability}</td>
                      <td className="px-2 py-2">{row.impactArea}</td>
                      <td className="px-2 py-2 text-right">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard title="Open Critical Risks / Issues" subtitle="Priority queue with owners">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left">Project</th>
                    <th className="px-2 py-2 text-left">Type</th>
                    <th className="px-2 py-2 text-left">Severity</th>
                    <th className="px-2 py-2 text-left">Owner</th>
                    <th className="px-2 py-2 text-right">Age (days)</th>
                  </tr>
                </thead>
                <tbody>
                  {riskCharts.criticalItems.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-2 py-2">{row.project}</td>
                      <td className="px-2 py-2">{row.type}</td>
                      <td className="px-2 py-2">{row.severity}</td>
                      <td className="px-2 py-2">{row.owner}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.ageDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard title="Risk/Issue Trend" subtitle="Opened vs closed over time" className="xl:col-span-2">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {riskCharts.trend.map((row) => (
                <div key={row.month} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-700">{row.month}</p>
                  <p className="text-xs text-slate-600">Opened: {row.opened}</p>
                  <p className="text-xs text-slate-600">Closed: {row.closed}</p>
                </div>
              ))}
            </div>
          </ChartCard>
        </section>
      ) : null}

      {activeTab === "Resources & Workload" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {canAssignProjectManagers ? (
            <ChartCard
              title="Project Manager Assignment"
              subtitle="Assign or reassign project managers using the current filtered project list."
              className="xl:col-span-2"
            >
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                  Project
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    value={assignmentProjectId}
                    onChange={(event) => {
                      setAssignmentProjectId(event.target.value);
                      setAssignmentMessage(null);
                      setAssignmentError(null);
                    }}
                  >
                    {projects.data.map((project) => (
                      <option key={`pm-assign-project-${project.projectId}`} value={project.projectId}>
                        {project.projectId} · {project.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                  Project Manager
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    value={assignmentManagerEmail}
                    onChange={(event) => {
                      setAssignmentManagerEmail(event.target.value);
                      setAssignmentMessage(null);
                      setAssignmentError(null);
                    }}
                  >
                    <option value="">Select project manager</option>
                    {managerOptions.map((user) => (
                      <option key={`pm-assign-manager-${user.id}`} value={user.email}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      void assignProjectManager();
                    }}
                    disabled={assigningManager || !assignmentProjectId}
                    className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {assigningManager ? "Assigning..." : "Assign Manager"}
                  </button>
                </div>
              </div>

              <p className="mt-2 text-xs text-slate-600">
                Current project manager:{" "}
                <span className="font-semibold text-slate-800">{selectedAssignmentProject?.projectManager || "-"}</span>
              </p>
              {assignmentError ? <p className="mt-2 text-sm text-rose-700">{assignmentError}</p> : null}
              {assignmentMessage ? <p className="mt-2 text-sm text-emerald-700">{assignmentMessage}</p> : null}
            </ChartCard>
          ) : null}

          <ChartCard title="Tasks Due in Next 14/30 Days" subtitle="Owner workload bar view">
            <div className="space-y-3">
              {resourceCharts.workload30.map((row) => {
                const due14 = resourceCharts.workload14.find((item) => item.owner === row.owner)?.tasksDue ?? 0;
                return (
                  <div key={row.owner} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-700">
                      <span>{row.owner}</span>
                      <span>
                        14d: {due14} | 30d: {row.tasksDue}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="h-2 rounded-full bg-slate-200">
                        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(due14 / maxWorkload) * 100}%` }} />
                      </div>
                      <div className="h-2 rounded-full bg-slate-200">
                        <div className="h-2 rounded-full bg-brand-700" style={{ width: `${(row.tasksDue / maxWorkload) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>

          <ChartCard title="Capacity Indicator" subtitle="Assigned projects per PM and overdue actions">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left">Owner</th>
                    <th className="px-2 py-2 text-right">Assigned Projects</th>
                    <th className="px-2 py-2 text-right">Overdue Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {resourceCharts.capacity.map((row) => (
                    <tr key={`cap-${row.owner}`} className="border-t border-slate-100">
                      <td className="px-2 py-2">{row.owner}</td>
                      <td className="px-2 py-2 text-right">{row.assignedProjects}</td>
                      <td className="px-2 py-2 text-right">{row.overdueActions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard title="PM Workload Table" subtitle="Open and overdue actions by owner" className="xl:col-span-2">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left">Owner</th>
                    <th className="px-2 py-2 text-right">Assigned Projects</th>
                    <th className="px-2 py-2 text-right">Open Tasks</th>
                    <th className="px-2 py-2 text-right">Overdue Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  {resourceCharts.table.map((row) => (
                    <tr key={`tbl-${row.owner}`} className="border-t border-slate-100">
                      <td className="px-2 py-2">{row.owner}</td>
                      <td className="px-2 py-2 text-right">{row.assignedProjects}</td>
                      <td className="px-2 py-2 text-right">{row.openTasks}</td>
                      <td className={`px-2 py-2 text-right ${row.overdueTasks > 0 ? "text-rose-700" : "text-slate-700"}`}>
                        {row.overdueTasks}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </section>
      ) : null}

      {activeTab === "Benefits & Value Tracking" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Benefits Target vs Realized" subtitle="US$ value progress by project" className="xl:col-span-1">
            <div className="space-y-2">
              {projects.data.map((row) => (
                <div key={`benefit-${row.projectId}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-700">
                    <span>{row.projectId}</span>
                    <span>
                      {formatMoney(row.benefitsRealizedToDate)} / {formatMoney(row.benefitsTargetTotal)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(row.benefitsRealizedToDate / maxBenefit) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="Budget vs Spend" subtitle="Approved budget, spend-to-date, and forecast-to-complete" className="xl:col-span-1">
            <div className="space-y-2">
              {projects.data.map((row) => (
                <div key={`budget-${row.projectId}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-700">
                    <span>{row.projectId}</span>
                    <span>{formatMoney(row.budgetApproved)}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-brand-700" style={{ width: `${(row.budgetApproved / maxBudget) * 100}%` }} />
                    </div>
                    <div className="h-2 rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-amber-500" style={{ width: `${(row.spendToDate / maxBudget) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="ROI Scatter (Proxy)" subtitle="ROI proxy by project and health" className="xl:col-span-2">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left">Project</th>
                    <th className="px-2 py-2 text-right">Approved Budget</th>
                    <th className="px-2 py-2 text-right">Benefits Target</th>
                    <th className="px-2 py-2 text-right">ROI Proxy</th>
                    <th className="px-2 py-2 text-left">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.data.map((row) => (
                    <tr key={`roi-${row.projectId}`} className="border-t border-slate-100">
                      <td className="px-2 py-2">{row.projectId}</td>
                      <td className="px-2 py-2 text-right">{formatMoney(row.budgetApproved)}</td>
                      <td className="px-2 py-2 text-right">{formatMoney(row.benefitsTargetTotal)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.roiProxy)}x</td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${healthColor[row.health] ?? "bg-slate-400"}`} />
                          {row.health}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </section>
      ) : null}

      {activeTab === "Project Drilldown" ? (
        <section className="space-y-4">
          <ChartCard title="Project List" subtitle="Select a project to open full drilldown view">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left">Project ID</th>
                    <th className="px-2 py-2 text-left">Project Name</th>
                    <th className="px-2 py-2 text-left">Stage</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Latest Change Status</th>
                    <th className="px-2 py-2 text-left">Change Risk Indicator</th>
                    <th className="px-2 py-2 text-left">PM</th>
                    <th className="px-2 py-2 text-right">SLA Cycle Days</th>
                    <th className="px-2 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.data.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-2 py-4 text-center text-slate-500">
                        No projects found.
                      </td>
                    </tr>
                  ) : (
                    projects.data.map((row) => (
                      <tr key={`drill-${row.projectId}`} className="border-t border-slate-100">
                        <td className="px-2 py-2 font-semibold text-brand-700">{row.projectId}</td>
                        <td className="px-2 py-2">{row.title}</td>
                        <td className="px-2 py-2">{row.stage}</td>
                        <td className="px-2 py-2">{row.status}</td>
                        <td className="px-2 py-2">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            row.latestChangeStatus === "NONE"
                              ? "border-slate-300 bg-slate-100 text-slate-600"
                              : row.latestChangeStatus === "REJECTED"
                                ? "border-red-200 bg-red-50 text-red-700"
                                : row.latestChangeStatus === "APPROVED" ||
                                    row.latestChangeStatus === "IMPLEMENTED" ||
                                    row.latestChangeStatus === "CLOSED"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}>
                            {row.latestChangeStatus ?? "NONE"}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap items-center gap-1 text-[11px]">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${
                              row.changeRiskIndicator === "CRITICAL"
                                ? "border-red-200 bg-red-50 text-red-700"
                                : row.changeRiskIndicator === "HIGH"
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : row.changeRiskIndicator === "MEDIUM"
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : row.changeRiskIndicator === "LOW"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-slate-300 bg-slate-100 text-slate-600"
                            }`}>
                              {row.changeRiskIndicator ?? "NONE"}
                            </span>
                            {row.hasOpenChangeRequest ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                Open CR
                              </span>
                            ) : null}
                            {row.hasBudgetImpact ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                Budget
                              </span>
                            ) : null}
                            {row.hasScheduleImpact ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                Schedule
                              </span>
                            ) : null}
                            {row.hasRiskEscalation ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-red-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                                Risk
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-2">{row.projectManager}</td>
                        <td className="px-2 py-2 text-right">{formatNumber(row.slaCycleDays)}</td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              void openDrilldown(row.projectId);
                            }}
                            className="rounded border border-brand-200 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
              <span>
                Showing {projects.data.length} of {projects.total} projects
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={projects.page <= 1}
                  className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                >
                  Prev
                </button>
                <span>Page {projects.page}</span>
                <button
                  type="button"
                  onClick={() => {
                    const maxPage = Math.max(1, Math.ceil(projects.total / projects.pageSize));
                    setPage((prev) => Math.min(maxPage, prev + 1));
                  }}
                  disabled={projects.page >= Math.ceil(Math.max(1, projects.total) / projects.pageSize)}
                  className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </ChartCard>
        </section>
      ) : null}

      {activeTab === "Change Management" ? (
        <ChangeManagementTab
          widgets={summary.changeWidgets}
          onOpenDrilldown={(projectId) => {
            void openDrilldown(projectId);
          }}
        />
      ) : null}

      <DrilldownDrawer
        open={drilldownOpen}
        loading={drilldownLoading}
        data={drilldownData}
        onClose={() => {
          setDrilldownOpen(false);
          setDrilldownData(null);
          setDrilldownLoading(false);
        }}
      />
    </div>
  );
}
