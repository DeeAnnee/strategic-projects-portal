"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";

import type { ProjectChangeIndicator } from "@/lib/change-management/types";
import type { ProjectSubmission, ProjectStatus } from "@/lib/submissions/types";
import { getSubmissionStatusLabel } from "@/lib/submissions/status-display";
import { isWorkflowEditableStatus, resolveCanonicalWorkflowState, resolveWorkflowLifecycleStatus } from "@/lib/submissions/workflow";

type Props = {
  rows: ProjectSubmission[];
  changeIndicators: Record<string, ProjectChangeIndicator>;
  personDirectory: Record<
    string,
    {
      name: string;
      photoUrl?: string;
    }
  >;
};

type SortKey =
  | "id"
  | "title"
  | "projectTheme"
  | "stage"
  | "segmentUnit"
  | "startDate"
  | "endDate"
  | "status"
  | "lastModifiedAt";
type SortDirection = "asc" | "desc";

type Filters = {
  id: string;
  title: string;
  projectTheme: string;
  stage: string;
  segmentUnit: string;
  startDateFrom: string;
  endDateTo: string;
  status: string;
};

type StageLabel = "Proposal" | "Funding" | "Live";
type RowWithDisplayStatus = ProjectSubmission & {
  displayStatus: string;
  statusLabel: string;
  stageLabel: StageLabel;
  lastModifiedAt: string;
  lastModifiedByName: string;
  lastModifiedByPhotoUrl?: string;
  hasOpenChangeRequest: boolean;
};

const formatDate = (value?: string) => {
  if (!value) return "-";
  const asDate = new Date(value);
  return Number.isNaN(asDate.getTime())
    ? "-"
    : asDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
};

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const asDate = new Date(value);
  return Number.isNaN(asDate.getTime())
    ? "-"
    : asDate.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
};

const includes = (source: string | undefined, query: string) =>
  (source ?? "").toLowerCase().includes(query.toLowerCase());

const asTime = (value?: string) => {
  if (!value) return Number.NaN;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NaN : time;
};

const getSubmissionStageLabel = (submission: ProjectSubmission): StageLabel => {
  const canonical = resolveCanonicalWorkflowState(submission);

  if (canonical.stage === "LIVE") {
    return "Live";
  }

  if (canonical.stage === "FUNDING") {
    return "Funding";
  }

  return "Proposal";
};

const toInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("") || "?";

const statusBadgeClass = (status: string) => {
  const normalized = status.toLowerCase();

  if (normalized.includes("live") || normalized.includes("active") || normalized.includes("approved") || normalized.includes("complete")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (normalized.includes("rejected") || normalized.includes("returned")) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (normalized.includes("deferred") || normalized.includes("cancelled") || normalized.includes("draft")) {
    return "border-slate-300 bg-slate-100 text-slate-600";
  }

  if (normalized.includes("change requested")) {
    return "border-amber-300 bg-amber-50 text-amber-700";
  }

  if (
    normalized.includes("progress") ||
    normalized.includes("pending") ||
    normalized.includes("review") ||
    normalized.includes("submitted") ||
    normalized.includes("approval")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-brand-200 bg-brand-50 text-brand-700";
};

const stageBadgeClass = (stage: StageLabel) => {
  if (stage === "Funding") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (stage === "Live") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
};

const IconFilter = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5h18l-7.2 8.1v5.2l-3.6 1.7v-6.9L3 5Z" />
  </svg>
);

const IconSortArrows = ({ direction }: { direction: SortDirection | null }) => {
  const upActive = direction === "asc";
  const downActive = direction === "desc";
  const neutral = direction === null;

  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <g className={upActive ? "opacity-100" : neutral ? "opacity-80" : "opacity-45"}>
        <path d="M7.5 18V6.5" />
        <path d="M3.7 10.3 7.5 6.5l3.8 3.8" />
      </g>
      <g className={downActive ? "opacity-100" : neutral ? "opacity-80" : "opacity-45"}>
        <path d="M16.5 6v11.5" />
        <path d="m12.7 13.7 3.8 3.8 3.8-3.8" />
      </g>
    </svg>
  );
};

export default function SubmissionsTable({ rows, changeIndicators, personDirectory }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    id: "",
    title: "",
    projectTheme: "",
    stage: "",
    segmentUnit: "",
    startDateFrom: "",
    endDateTo: "",
    status: ""
  });

  const rowsWithDisplayStatus = useMemo<RowWithDisplayStatus[]>(
    () =>
      rows.map((row) => ({
        ...(() => {
          const stageLabel = getSubmissionStageLabel(row);
          const hasOpenChangeRequest = changeIndicators[row.id]?.hasOpenChangeRequest ?? false;
          const displayStatus = getSubmissionStatusLabel(row);
          return {
            displayStatus,
            statusLabel: hasOpenChangeRequest ? "Change Requested" : stageLabel === "Live" ? "Active" : displayStatus,
            stageLabel,
            hasOpenChangeRequest
          };
        })(),
        ...((): {
          lastModifiedAt: string;
          lastModifiedByName: string;
          lastModifiedByPhotoUrl?: string;
        } => {
          const sortedAudit = [...(row.auditTrail ?? [])].sort((a, b) => {
            const aTime = asTime(a.createdAt);
            const bTime = asTime(b.createdAt);
            if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
            if (Number.isNaN(aTime)) return 1;
            if (Number.isNaN(bTime)) return -1;
            return bTime - aTime;
          });
          const latestAudit = sortedAudit[0];
          const fallbackName = latestAudit?.actorName?.trim() || row.ownerName || "Unknown User";
          const emailKey = (latestAudit?.actorEmail || row.ownerEmail || "").trim().toLowerCase();
          const directoryEntry = emailKey ? personDirectory[emailKey] : undefined;
          return {
            lastModifiedAt: latestAudit?.createdAt || row.updatedAt || row.createdAt,
            lastModifiedByName: directoryEntry?.name || fallbackName,
            lastModifiedByPhotoUrl: directoryEntry?.photoUrl
          };
        })(),
        ...row
      })),
    [changeIndicators, personDirectory, rows]
  );

  const stageOptions: StageLabel[] = ["Proposal", "Funding", "Live"];

  const statusOptions = useMemo(
    () =>
      Array.from(new Set(rowsWithDisplayStatus.map((row) => row.statusLabel as ProjectStatus | string)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [rowsWithDisplayStatus]
  );

  const filteredRows = useMemo(() => {
    return rowsWithDisplayStatus.filter((row) => {
      const matchesId = includes(row.id, filters.id);
      const matchesTitle = includes(row.title, filters.title);
      const matchesTheme = includes(row.projectTheme, filters.projectTheme);
      const matchesStage = filters.stage ? row.stageLabel === filters.stage : true;
      const matchesSegment = includes(row.segmentUnit, filters.segmentUnit);
      const matchesStatus = filters.status ? row.statusLabel === filters.status : true;

      const startTime = asTime(row.startDate);
      const endTime = asTime(row.endDate);
      const startFrom = filters.startDateFrom ? new Date(filters.startDateFrom).getTime() : Number.NaN;
      const endTo = filters.endDateTo ? new Date(filters.endDateTo).getTime() : Number.NaN;

      const matchesStart = Number.isNaN(startFrom) ? true : (!Number.isNaN(startTime) && startTime >= startFrom);
      const matchesEnd = Number.isNaN(endTo) ? true : (!Number.isNaN(endTime) && endTime <= endTo);

      return matchesId && matchesTitle && matchesTheme && matchesStage && matchesSegment && matchesStatus && matchesStart && matchesEnd;
    });
  }, [rowsWithDisplayStatus, filters]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      if (sortKey === "status") {
        const comparison = a.statusLabel.localeCompare(b.statusLabel, undefined, {
          numeric: true,
          sensitivity: "base"
        });
        return sortDirection === "asc" ? comparison : -comparison;
      }

      if (sortKey === "stage") {
        const comparison = a.stageLabel.localeCompare(b.stageLabel, undefined, {
          numeric: true,
          sensitivity: "base"
        });
        return sortDirection === "asc" ? comparison : -comparison;
      }

      if (sortKey === "startDate" || sortKey === "endDate") {
        const aTime = asTime(a[sortKey]);
        const bTime = asTime(b[sortKey]);
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
        if (Number.isNaN(aTime)) return 1;
        if (Number.isNaN(bTime)) return -1;
        return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
      }

      if (sortKey === "lastModifiedAt") {
        const aTime = asTime(a.lastModifiedAt);
        const bTime = asTime(b.lastModifiedAt);
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
        if (Number.isNaN(aTime)) return 1;
        if (Number.isNaN(bTime)) return -1;
        return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
      }

      const aValue = String(a[sortKey] ?? "").toLowerCase();
      const bValue = String(b[sortKey] ?? "").toLowerCase();
      const comparison = aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return copy;
  }, [filteredRows, sortDirection, sortKey]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  return (
    <div className="relative pt-9">
      <div className="absolute right-0 top-1 z-10 flex w-[96px] justify-center">
        <button
          type="button"
          onClick={() => setFiltersOpen((prev) => !prev)}
          className={`inline-flex items-center gap-1 rounded-md border border-brand-200 px-2 py-1 text-xs font-semibold text-brand-700 transition ${
            filtersOpen ? "bg-brand-50" : "bg-white hover:bg-brand-50"
          }`}
          title={filtersOpen ? "Hide filters" : "Show filters"}
          aria-label={filtersOpen ? "Hide filters" : "Show filters"}
        >
          <IconFilter className="h-3.5 w-3.5" />
          <span>Filter</span>
        </button>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[1440px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-brand-700 text-white">
          <tr className="text-xs uppercase tracking-[0.04em]">
            <th className="px-4 py-3 font-semibold">
              <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("id")}>
                Project ID <IconSortArrows direction={sortKey === "id" ? sortDirection : null} />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("title")}>
                Project Name <IconSortArrows direction={sortKey === "title" ? sortDirection : null} />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("projectTheme")}>
                Project Theme <IconSortArrows direction={sortKey === "projectTheme" ? sortDirection : null} />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("stage")}>
                Stage <IconSortArrows direction={sortKey === "stage" ? sortDirection : null} />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("segmentUnit")}>
                Segment <IconSortArrows direction={sortKey === "segmentUnit" ? sortDirection : null} />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("startDate")}>
                Est Start Date <IconSortArrows direction={sortKey === "startDate" ? sortDirection : null} />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("endDate")}>
                Est End Date <IconSortArrows direction={sortKey === "endDate" ? sortDirection : null} />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("status")}>
                Status <IconSortArrows direction={sortKey === "status" ? sortDirection : null} />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("lastModifiedAt")}>
                Last Modified <IconSortArrows direction={sortKey === "lastModifiedAt" ? sortDirection : null} />
              </button>
            </th>
            <th className="w-[96px] px-3 py-3 font-semibold text-center">Action</th>
          </tr>
          {filtersOpen ? (
            <tr className="border-t border-white/20 bg-brand-800/55">
              <th className="px-3 py-2">
                <input
                  value={filters.id}
                  onChange={(event) => setFilters((prev) => ({ ...prev, id: event.target.value }))}
                  className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                  placeholder="Filter ID"
                />
              </th>
              <th className="px-3 py-2">
                <input
                  value={filters.title}
                  onChange={(event) => setFilters((prev) => ({ ...prev, title: event.target.value }))}
                  className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                  placeholder="Filter name"
                />
              </th>
              <th className="px-3 py-2">
                <input
                  value={filters.projectTheme}
                  onChange={(event) => setFilters((prev) => ({ ...prev, projectTheme: event.target.value }))}
                  className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                  placeholder="Filter theme"
                />
              </th>
              <th className="px-3 py-2">
                <select
                  value={filters.stage}
                  onChange={(event) => setFilters((prev) => ({ ...prev, stage: event.target.value }))}
                  className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500"
                >
                  <option value="">All stages</option>
                  {stageOptions.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-3 py-2">
                <input
                  value={filters.segmentUnit}
                  onChange={(event) => setFilters((prev) => ({ ...prev, segmentUnit: event.target.value }))}
                  className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                  placeholder="Filter segment"
                />
              </th>
              <th className="px-3 py-2">
                <input
                  type="date"
                  value={filters.startDateFrom}
                  onChange={(event) => setFilters((prev) => ({ ...prev, startDateFrom: event.target.value }))}
                  className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500"
                  title="Start date from"
                />
              </th>
              <th className="px-3 py-2">
                <input
                  type="date"
                  value={filters.endDateTo}
                  onChange={(event) => setFilters((prev) => ({ ...prev, endDateTo: event.target.value }))}
                  className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500"
                  title="End date to"
                />
              </th>
              <th className="px-3 py-2">
                <select
                  value={filters.status}
                  onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                  className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500"
                >
                  <option value="">All statuses</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-3 py-2 text-left">
                <span className="text-[11px] text-white/75">N/A</span>
              </th>
              <th className="px-3 py-2 text-left">
                <button
                  type="button"
                  onClick={() =>
                    setFilters({
                      id: "",
                      title: "",
                      projectTheme: "",
                      stage: "",
                      segmentUnit: "",
                      startDateFrom: "",
                      endDateTo: "",
                      status: ""
                    })
                  }
                  className="rounded border border-white/45 bg-white/90 px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white"
                >
                  Clear
                </button>
              </th>
            </tr>
          ) : null}
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-left text-slate-500" colSpan={10}>
                  No records match the current filters.
                </td>
              </tr>
            ) : (
              sortedRows.map((item, index) => (
                <tr key={item.id} className={`border-t border-slate-100 hover:bg-slate-50 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                  <td className="px-4 py-3 font-semibold text-brand-700">{item.id}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{item.title}</td>
                  <td className="px-4 py-3 text-slate-700">{item.projectTheme || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${stageBadgeClass(item.stageLabel)}`}>
                      {item.stageLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{item.segmentUnit || "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(item.startDate)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(item.endDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(item.statusLabel)}`}>
                      {item.statusLabel}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      {item.lastModifiedByPhotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.lastModifiedByPhotoUrl}
                          alt={item.lastModifiedByName}
                          className="h-7 w-7 rounded-full border border-slate-200 object-cover"
                        />
                      ) : (
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-[11px] font-semibold text-brand-700">
                          {toInitials(item.lastModifiedByName)}
                        </span>
                      )}
                      <div className="leading-tight">
                        <p className="text-xs font-semibold text-slate-800">{item.lastModifiedByName}</p>
                        <p className="text-[11px] text-slate-500">{formatDateTime(item.lastModifiedAt)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {(() => {
                      const lifecycleStatus = resolveWorkflowLifecycleStatus(item);
                      const canOpenEditable = isWorkflowEditableStatus(lifecycleStatus);
                      const targetHref = (canOpenEditable
                        ? `/submissions/${item.id}/edit`
                        : `/submissions/${item.id}/edit?mode=view`) as Route;
                      return (
                        <Link
                          href={targetHref}
                          className="inline-flex rounded-md border border-brand-300 bg-white px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                        >
                          {canOpenEditable ? "Open" : "View"}
                        </Link>
                      );
                    })()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
