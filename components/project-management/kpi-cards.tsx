"use client";

import type { PmKpis } from "@/lib/pm-dashboard/types";

type Props = {
  kpis: PmKpis;
  isLoading?: boolean;
};

const kpiMeta: Array<{ key: keyof PmKpis; label: string; suffix?: string }> = [
  { key: "totalActiveProjects", label: "Total Active Projects" },
  { key: "onTrackPct", label: "On Track", suffix: "%" },
  { key: "atRiskCount", label: "At Risk Count" },
  { key: "slaCompliancePct", label: "SLA Compliance", suffix: "%" },
  { key: "avgCycleTimeDays", label: "Avg Cycle Time", suffix: " days" },
  { key: "overdueMilestones", label: "Overdue Milestones" },
  { key: "overdueTasks", label: "Overdue Tasks" }
];

export default function KpiCards({ kpis, isLoading = false }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      {kpiMeta.map((item) => {
        const value = kpis[item.key];
        return (
          <article key={item.key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{item.label}</p>
            {isLoading ? (
              <div className="mt-2 h-7 w-16 animate-pulse rounded bg-slate-200" />
            ) : (
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {Number.isFinite(value) ? value.toLocaleString("en-US") : 0}
                {item.suffix ?? ""}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

