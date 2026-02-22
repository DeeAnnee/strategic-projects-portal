"use client";

import { useEffect, useMemo, useState } from "react";

import {
  applyDashboardFilters,
  buildDashboardModel,
  categoryTheme,
  DASHBOARD_LAYERS,
  getFilterOptions,
  type DashboardFilters,
  type DashboardLayerKey,
  stageProgressPct,
  STAGE_ORDER
} from "@/lib/dashboard/intelligence";
import { getSubmissionStatusLabel } from "@/lib/submissions/status-display";
import type { ProjectSubmission } from "@/lib/submissions/types";

type Props = {
  submissions: ProjectSubmission[];
  userName?: string | null;
  role?: string;
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1
});

const metric = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const prettyDate = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

function KpiTile({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{caption}</p>
    </article>
  );
}

function DistributionBars({
  title,
  subtitle,
  items
}: {
  title: string;
  subtitle: string;
  items: { label: string; value: number; pct: number }[];
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No data in the current filter window.</p>
        ) : (
          items.map((item) => (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                <span>{item.label}</span>
                <span>
                  {item.value} ({item.pct}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-[#b00a30]" style={{ width: `${item.pct}%` }} />
              </div>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function TrendLine({
  title,
  subtitle,
  points
}: {
  title: string;
  subtitle: string;
  points: { month: string; value: number }[];
}) {
  const max = Math.max(...points.map((point) => point.value), 1);
  const coords = points.map((point, index) => {
    const x = points.length > 1 ? (index / (points.length - 1)) * 100 : 50;
    const y = 40 - (point.value / max) * 34;
    return `${x},${y}`;
  });

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      <div className="mt-5 h-40">
        <svg viewBox="0 0 100 42" className="h-full w-full">
          <rect x={0} y={0} width={100} height={42} fill="#f8fafc" rx={3} />
          <polyline points={coords.join(" ")} fill="none" stroke="#b00a30" strokeWidth={1.7} />
          {coords.map((point, index) => {
            const [x, y] = point.split(",");
            return <circle key={`${point}-${index}`} cx={x} cy={y} r={1.2} fill="#b00a30" />;
          })}
        </svg>
      </div>
      <div className="mt-2 grid grid-cols-6 gap-1 text-center text-[10px] text-slate-500">
        {points.map((point) => (
          <span key={point.month}>{point.month}</span>
        ))}
      </div>
    </article>
  );
}

function GoalMeter({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const isOnTrack = value >= target;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            isOnTrack ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          Target {target}%
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{value}%</p>
      <div className="mt-2 h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-[#b00a30]" style={{ width: `${pct}%` }} />
      </div>
    </article>
  );
}

export default function ModernDashboard({ submissions, userName, role }: Props) {
  const [activeLayer, setActiveLayer] = useState<DashboardLayerKey>("operational");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [confidence, setConfidence] = useState(80);
  const [delayPct, setDelayPct] = useState(12);
  const [filters, setFilters] = useState<DashboardFilters>({
    search: "",
    businessUnit: "All",
    stage: "All",
    category: "All"
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(submissions[0]?.id ?? null);

  useEffect(() => {
    const timer = setInterval(() => setLastRefresh(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const filterOptions = useMemo(() => getFilterOptions(submissions), [submissions]);
  const filtered = useMemo(() => applyDashboardFilters(submissions, filters), [submissions, filters]);
  const model = useMemo(() => buildDashboardModel(filtered), [filtered]);

  useEffect(() => {
    if (model.contextual.projectOrder.length === 0) {
      setSelectedProjectId(null);
      return;
    }

    if (!selectedProjectId || !model.contextual.projectMap.has(selectedProjectId)) {
      setSelectedProjectId(model.contextual.projectOrder[0]);
    }
  }, [model.contextual.projectMap, model.contextual.projectOrder, selectedProjectId]);

  const selectedProject = selectedProjectId
    ? model.contextual.projectMap.get(selectedProjectId) ?? null
    : null;

  const scenario = useMemo(() => {
    const baseline = model.totals.savingsPipeline;
    const confidenceImpact = baseline * ((confidence - 50) / 100) * 0.35;
    const delayImpact = baseline * (delayPct / 100) * 0.4;
    return {
      optimistic: Math.max(0, baseline + confidenceImpact),
      expected: Math.max(0, baseline + confidenceImpact - delayImpact),
      conservative: Math.max(0, baseline - delayImpact * 1.2)
    };
  }, [confidence, delayPct, model.totals.savingsPipeline]);

  const activeLayerMeta = DASHBOARD_LAYERS.find((layer) => layer.key === activeLayer) ?? DASHBOARD_LAYERS[0];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-white to-[#fff3f7] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b00a30]">Enterprise Intelligence Platform</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-900">Strategic Intelligence Dashboard</h2>
        <p className="mt-2 text-sm text-slate-600">
          Unified multi-layer architecture for operational, strategic, analytical, tactical, and project context monitoring.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-slate-100 px-3 py-1">User: {userName ?? "Team"}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">Role: {role ?? "N/A"}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">
            Last refresh: {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="rounded-full bg-[#fff0f4] px-3 py-1 text-[#8f0827]">{filtered.length} projects in scope</span>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {DASHBOARD_LAYERS.map((layer) => (
            <button
              key={layer.key}
              type="button"
              onClick={() => setActiveLayer(layer.key)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                activeLayer === layer.key
                  ? "bg-[#b00a30] text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {layer.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-600">{activeLayerMeta.description}</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Search
            <input
              type="text"
              placeholder="Case ID, project title, owner"
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Business Unit
            <select
              value={filters.businessUnit}
              onChange={(event) => setFilters((prev) => ({ ...prev, businessUnit: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal"
            >
              <option value="All">All business units</option>
              {filterOptions.businessUnits.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Stage
            <select
              value={filters.stage}
              onChange={(event) => setFilters((prev) => ({ ...prev, stage: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal"
            >
              <option value="All">All stages</option>
              {filterOptions.stages.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Category
            <select
              value={filters.category}
              onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal"
            >
              <option value="All">All categories</option>
              {filterOptions.categories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {activeLayer === "operational" ? (
        <div className="space-y-4">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiTile
              label="Active Programs"
              value={metric.format(model.totals.activePrograms)}
              caption="Items across active delivery and review stages."
            />
            <KpiTile
              label="In Review"
              value={metric.format(model.totals.inReview)}
              caption="Submitted and approval-stage items."
            />
            <KpiTile
              label="SLA Risk"
              value={metric.format(model.totals.slaRiskCount)}
              caption="Sponsor-stage items aging more than 7 days."
            />
            <KpiTile
              label="Approved"
              value={metric.format(model.totals.approved)}
              caption="Portfolio items with approved status."
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <DistributionBars
              title="Stage Throughput"
              subtitle="Operational workload by stage."
              items={model.distributions.byStage}
            />
            <DistributionBars
              title="Status Mix"
              subtitle="Real-time health by status."
              items={model.distributions.byStatus}
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Operational Watchlist</h3>
            <p className="mt-1 text-xs text-slate-500">Highest risk and priority projects requiring active management.</p>
            <div className="mt-4 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Project</th>
                    <th className="px-2 py-2">Stage</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Priority</th>
                    <th className="px-2 py-2">Risk</th>
                    <th className="px-2 py-2 text-right">Expected Value</th>
                  </tr>
                </thead>
                <tbody>
                  {model.watchlist.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                        No projects in current filter scope.
                      </td>
                    </tr>
                  ) : (
                    model.watchlist.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-semibold text-[#8f0827]">
                          {item.id} · {item.title}
                        </td>
                        <td className="px-2 py-2">{item.stage}</td>
                        <td className="px-2 py-2">{item.status}</td>
                        <td className="px-2 py-2">{item.priority}</td>
                        <td className="px-2 py-2">{item.riskLevel}</td>
                        <td className="px-2 py-2 text-right font-semibold">{compactMoney.format(item.expectedValue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {activeLayer === "strategic" ? (
        <div className="space-y-4">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiTile
              label="Savings Pipeline"
              value={compactMoney.format(model.totals.savingsPipeline)}
              caption="Run-rate savings + benefit uplift potential."
            />
            <KpiTile
              label="Portfolio Investment"
              value={compactMoney.format(model.totals.totalInvestment)}
              caption="CAPEX and one-time investment exposure."
            />
            <KpiTile
              label="Average Payback"
              value={`${metric.format(model.totals.avgPaybackYears)} yrs`}
              caption="Average payback for modeled projects."
            />
            <KpiTile
              label="Portfolio Size"
              value={metric.format(model.totals.totalProjects)}
              caption="Filtered strategic initiative footprint."
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <DistributionBars
              title="Business Unit Mix"
              subtitle="Strategic concentration by business unit."
              items={model.distributions.byBusinessUnit}
            />
            <DistributionBars
              title="Category Allocation"
              subtitle="Transformation investment categories."
              items={model.distributions.byCategory}
            />
            <TrendLine
              title="Portfolio Growth Trend"
              subtitle="6-month project intake trend."
              points={model.timeline.map((point) => ({ month: point.month, value: point.volume }))}
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Long-Horizon Financial Profile</h3>
            <p className="mt-1 text-xs text-slate-500">
              Incremental revenue and cost outlook aggregated from project financial plans.
            </p>
            <div className="mt-4 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Year</th>
                    <th className="px-2 py-2 text-right">Revenue</th>
                    <th className="px-2 py-2 text-right">Saved Costs</th>
                    <th className="px-2 py-2 text-right">Addl. Costs</th>
                    <th className="px-2 py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {model.incrementalByYear.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                        No incremental financial timeline is available for the current filter.
                      </td>
                    </tr>
                  ) : (
                    model.incrementalByYear.map((row) => (
                      <tr key={row.year} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-semibold">{row.year}</td>
                        <td className="px-2 py-2 text-right">{money.format(row.revenue)}</td>
                        <td className="px-2 py-2 text-right">{money.format(row.savedCosts)}</td>
                        <td className="px-2 py-2 text-right">{money.format(row.addlOperatingCosts)}</td>
                        <td className="px-2 py-2 text-right font-semibold">{money.format(row.net)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {activeLayer === "analytical" ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Scenario Modeling Studio</h3>
            <p className="mt-1 text-xs text-slate-500">
              Explore portfolio outcome sensitivity using confidence and delay assumptions.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                Forecast confidence ({confidence}%)
                <input
                  type="range"
                  min={50}
                  max={95}
                  value={confidence}
                  onChange={(event) => setConfidence(Number(event.target.value))}
                  className="mt-2 w-full accent-[#b00a30]"
                />
              </label>
              <label className="text-sm">
                Delivery delay impact ({delayPct}%)
                <input
                  type="range"
                  min={0}
                  max={35}
                  value={delayPct}
                  onChange={(event) => setDelayPct(Number(event.target.value))}
                  className="mt-2 w-full accent-[#b00a30]"
                />
              </label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <KpiTile
                label="Optimistic"
                value={compactMoney.format(scenario.optimistic)}
                caption="High-confidence upside scenario."
              />
              <KpiTile
                label="Expected"
                value={compactMoney.format(scenario.expected)}
                caption="Central estimate after delay impact."
              />
              <KpiTile
                label="Conservative"
                value={compactMoney.format(scenario.conservative)}
                caption="Downside scenario under stress."
              />
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <TrendLine
              title="Value Momentum"
              subtitle="6-month value flow (expected value)."
              points={model.timeline.map((point) => ({ month: point.month, value: point.value }))}
            />
            <DistributionBars
              title="Stage Risk Distribution"
              subtitle="Where modeled value is currently sitting."
              items={model.distributions.byStage}
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Project Diagnostics</h3>
            <p className="mt-1 text-xs text-slate-500">Detailed project-level indicators for analytical deep dives.</p>
            <div className="mt-4 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Case</th>
                    <th className="px-2 py-2">Business Unit</th>
                    <th className="px-2 py-2 text-right">Expected Value</th>
                    <th className="px-2 py-2 text-right">Payback (yrs)</th>
                    <th className="px-2 py-2 text-right">Dependencies</th>
                  </tr>
                </thead>
                <tbody>
                  {model.watchlist.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                        No diagnostic records found in current filter scope.
                      </td>
                    </tr>
                  ) : (
                    model.watchlist.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-semibold text-[#8f0827]">
                          {item.id} · {item.title}
                        </td>
                        <td className="px-2 py-2">{item.businessUnit}</td>
                        <td className="px-2 py-2 text-right">{compactMoney.format(item.expectedValue)}</td>
                        <td className="px-2 py-2 text-right">{metric.format(item.paybackYears)}</td>
                        <td className="px-2 py-2 text-right">{item.dependencyCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {activeLayer === "tactical" ? (
        <div className="space-y-4">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <GoalMeter label="Sponsor Approval Rate" value={model.tactical.sponsorApprovalRate} target={75} />
            <GoalMeter label="Funding Conversion Rate" value={model.tactical.fundingConversionRate} target={40} />
            <GoalMeter label="Governance Completion Rate" value={model.tactical.governanceCompletionRate} target={60} />
            <GoalMeter label="Live Delivery Rate" value={model.tactical.liveDeliveryRate} target={30} />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Initiative Flow by Stage</h3>
            <p className="mt-1 text-xs text-slate-500">Tactical progression signal across the stage-gate model.</p>
            <div className="mt-4 space-y-3">
              {STAGE_ORDER.map((stage) => {
                const match = model.distributions.byStage.find((item) => item.label === stage);
                const count = match?.value ?? 0;
                const pct = match?.pct ?? 0;
                return (
                  <div key={stage}>
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                      <span>{stage}</span>
                      <span>
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-[#b00a30]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Action Focus</h3>
            <p className="mt-1 text-xs text-slate-500">
              Tactical callouts based on high-priority projects in the filtered portfolio.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {model.watchlist.slice(0, 4).map((item) => (
                <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-[#8f0827]">
                    {item.id} · {item.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Owner: {item.ownerName} · Stage: {item.stage} · Status: {item.status}
                  </p>
                  <p className="mt-2 text-xs text-slate-700">
                    Priority {item.priority} / Risk {item.riskLevel}. Focus on milestone execution and decision closure.
                  </p>
                </article>
              ))}
              {model.watchlist.length === 0 ? (
                <p className="text-sm text-slate-500">No tactical actions available in current filters.</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeLayer === "contextual" ? (
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Project Context Navigator</h3>
            <p className="mt-1 text-xs text-slate-500">Select a project to inspect contextual delivery details.</p>
            <div className="mt-4 max-h-[520px] space-y-2 overflow-auto pr-1">
              {model.contextual.projectOrder.length === 0 ? (
                <p className="text-sm text-slate-500">No project records in this filter scope.</p>
              ) : (
                model.contextual.projectOrder.map((projectId) => {
                  const project = model.contextual.projectMap.get(projectId);
                  if (!project) return null;
                  const active = selectedProjectId === projectId;
                  return (
                    <button
                      key={projectId}
                      type="button"
                      onClick={() => setSelectedProjectId(projectId)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                        active
                          ? "border-[#b00a30] bg-[#fff0f4]"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <p className="text-sm font-semibold text-[#8f0827]">
                        {project.id} · {project.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {project.businessUnit} · {project.stage}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            {!selectedProject ? (
              <p className="text-sm text-slate-500">Select a project to view contextual details.</p>
            ) : (
              <div className="space-y-5">
                <header>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b00a30]">Project Context</p>
                  <h3 className="mt-1 text-2xl font-semibold text-slate-900">
                    {selectedProject.id} · {selectedProject.title}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                      {selectedProject.businessUnit}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${categoryTheme(selectedProject.category)}`}>
                      {selectedProject.category}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                      Status: {getSubmissionStatusLabel(selectedProject)}
                    </span>
                  </div>
                </header>

                <div className="grid gap-4 md:grid-cols-2">
                  <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Schedule</p>
                    <p className="mt-2 text-sm text-slate-700">
                      Start: <span className="font-semibold">{prettyDate(selectedProject.startDate)}</span>
                    </p>
                    <p className="text-sm text-slate-700">
                      End: <span className="font-semibold">{prettyDate(selectedProject.endDate)}</span>
                    </p>
                    <p className="text-sm text-slate-700">
                      Go-live: <span className="font-semibold">{prettyDate(selectedProject.targetGoLive)}</span>
                    </p>
                  </article>

                  <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Financial Snapshot</p>
                    <p className="mt-2 text-sm text-slate-700">
                      Savings pipeline:{" "}
                      <span className="font-semibold">
                        {money.format(
                          (selectedProject.financials.runRateSavings ?? 0) +
                            (selectedProject.benefits.costSaveEst ?? 0) +
                            (selectedProject.benefits.revenueUpliftEst ?? 0)
                        )}
                      </span>
                    </p>
                    <p className="text-sm text-slate-700">
                      Investment:{" "}
                      <span className="font-semibold">
                        {money.format(
                          (selectedProject.financials.capex ?? 0) +
                            (selectedProject.financials.oneTimeCosts ?? 0)
                        )}
                      </span>
                    </p>
                    <p className="text-sm text-slate-700">
                      Payback:{" "}
                      <span className="font-semibold">
                        {metric.format(
                          typeof selectedProject.financials.paybackYears === "number"
                            ? selectedProject.financials.paybackYears
                            : (selectedProject.financials.paybackMonths ?? 0) / 12
                        )}{" "}
                        yrs
                      </span>
                    </p>
                  </article>
                </div>

                <article className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Stage Progress</p>
                  <div className="mt-3 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-[#b00a30]"
                      style={{ width: `${stageProgressPct(selectedProject.stage)}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {STAGE_ORDER.map((stage) => (
                      <span
                        key={stage}
                        className={`rounded-full px-2 py-0.5 ${
                          stage === selectedProject.stage
                            ? "bg-[#b00a30] text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {stage}
                      </span>
                    ))}
                  </div>
                </article>

                <article className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Dependencies</p>
                  {selectedProject.dependencies.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No dependencies captured.</p>
                  ) : (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {selectedProject.dependencies.map((dependency) => (
                        <li key={dependency}>{dependency}</li>
                      ))}
                    </ul>
                  )}
                </article>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
