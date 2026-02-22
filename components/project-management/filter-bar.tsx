"use client";

import type { PmDashboardFilters } from "@/lib/pm-dashboard/types";

type FilterOptions = {
  stages: string[];
  statuses: string[];
  health: string[];
  sponsors: string[];
  projectManagers: string[];
  businessUnits: string[];
};

type Props = {
  filters: PmDashboardFilters;
  options: FilterOptions;
  isLoading?: boolean;
  lastRefreshedAt?: string;
  onFilterChange: (key: keyof PmDashboardFilters, value: string) => void;
  onReset: () => void;
  onExport: (format: "pdf" | "excel" | "ppt") => void;
};

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100";

export default function FilterBar({
  filters,
  options,
  isLoading = false,
  lastRefreshedAt,
  onFilterChange,
  onReset,
  onExport
}: Props) {
  return (
    <section className="rounded-xl border border-brand-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Global Filters</h3>
          <p className="text-xs text-slate-500">
            {lastRefreshedAt
              ? `Last refreshed ${new Date(lastRefreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Live analytics"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onExport("pdf")}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => onExport("excel")}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => onExport("ppt")}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export PPT
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={isLoading}
            className="rounded-md bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Search
          <input
            type="text"
            value={filters.search}
            onChange={(event) => onFilterChange("search", event.target.value)}
            placeholder="Project ID, name, PM"
            className={inputClass}
          />
        </label>

        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Stage
          <select
            value={filters.stage}
            onChange={(event) => onFilterChange("stage", event.target.value)}
            className={inputClass}
          >
            {options.stages.map((item) => (
              <option key={`stage-${item}`} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Status
          <select
            value={filters.status}
            onChange={(event) => onFilterChange("status", event.target.value)}
            className={inputClass}
          >
            {options.statuses.map((item) => (
              <option key={`status-${item}`} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Health
          <select
            value={filters.health}
            onChange={(event) => onFilterChange("health", event.target.value)}
            className={inputClass}
          >
            {options.health.map((item) => (
              <option key={`health-${item}`} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Sponsor
          <select
            value={filters.sponsor}
            onChange={(event) => onFilterChange("sponsor", event.target.value)}
            className={inputClass}
          >
            {options.sponsors.map((item) => (
              <option key={`sponsor-${item}`} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Project Manager
          <select
            value={filters.projectManager}
            onChange={(event) => onFilterChange("projectManager", event.target.value)}
            className={inputClass}
          >
            {options.projectManagers.map((item) => (
              <option key={`pm-${item}`} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Segment / Unit
          <select
            value={filters.businessUnit}
            onChange={(event) => onFilterChange("businessUnit", event.target.value)}
            className={inputClass}
          >
            {options.businessUnits.map((item) => (
              <option key={`bu-${item}`} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Date From
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => onFilterChange("dateFrom", event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Date To
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => onFilterChange("dateTo", event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
    </section>
  );
}

