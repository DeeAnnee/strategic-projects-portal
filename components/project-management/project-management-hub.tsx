"use client";

import { useEffect, useMemo, useState } from "react";

import FundingRequestPreviewSummary from "@/components/submissions/funding-request-preview-summary";
import {
  calculateDepreciationOfCapitalByYear,
  calculateFinancialMetrics,
  calculateNetBenefitsByYear
} from "@/lib/submissions/financial-metrics";
import type { FinancialGrid, ProjectSubmission } from "@/lib/submissions/types";

type Props = {
  submissions: ProjectSubmission[];
};

type DashboardStatus = "In Progress" | "Completed" | "Cancelled" | "On Hold" | "Planned";
type SortDirection = "asc" | "desc";

type SortKey =
  | "projectId"
  | "projectName"
  | "projectType"
  | "segmentUnit"
  | "projectManager"
  | "priority"
  | "startDate"
  | "endDate"
  | "goLiveDate"
  | "benefitRealizationStartDate"
  | "expense"
  | "budget"
  | "budgetUtilizationPct"
  | "status";

type Filters = {
  projectId: string;
  projectName: string;
  projectType: string;
  segmentUnit: string;
  projectManager: string;
  priority: string;
  startDateFrom: string;
  endDateTo: string;
  goLiveDateFrom: string;
  benefitRealizationStartDateFrom: string;
  status: string;
};

type RowModel = {
  projectId: string;
  projectName: string;
  projectType: string;
  segmentUnit: string;
  projectManager: string;
  projectManagerEmail?: string;
  priority: string;
  startDate: string;
  endDate: string;
  goLiveDate: string;
  benefitRealizationStartDate: string;
  startDateRaw?: string;
  endDateRaw?: string;
  goLiveDateRaw?: string;
  benefitRealizationStartDateRaw?: string;
  expense: number;
  budget: number;
  budgetUtilizationPct: number;
  status: DashboardStatus;
};

const statusColor: Record<DashboardStatus, string> = {
  "In Progress": "bg-brand-600",
  Completed: "bg-brand-700",
  Cancelled: "bg-slate-700",
  "On Hold": "bg-slate-500",
  Planned: "bg-slate-300"
};

const investmentRows = [
  { key: "hardware", label: "Hardware" },
  { key: "software", label: "Software" },
  { key: "consultancyVendor", label: "Consultancy/Vendor" },
  { key: "premisesRealEstate", label: "Premises/Real Estate" },
  { key: "otherCapital", label: "Other Capital" },
  { key: "expenses", label: "Expenses" }
] as const;

const capitalRowKeys: Array<(typeof investmentRows)[number]["key"]> = [
  "hardware",
  "software",
  "consultancyVendor",
  "premisesRealEstate",
  "otherCapital"
];

const emptyFinancialDetails: ProjectSubmission["financials"] = {
  capex: 0,
  opex: 0,
  oneTimeCosts: 0,
  runRateSavings: 0,
  paybackMonths: 0,
  paybackYears: 0,
  npv: 0,
  irr: 0
};

const isFundingStageSubmission = (submission?: ProjectSubmission | null) => {
  if (!submission) return false;
  return (
    submission.stage === "FUNDING" ||
    submission.stage === "LIVE" ||
    submission.workflow.fundingStatus === "Requested" ||
    submission.workflow.fundingStatus === "Funded" ||
    submission.workflow.fundingStatus === "Live"
  );
};

const makeFallbackFinancialGrid = (year = new Date().getFullYear()): FinancialGrid => ({
  commencementFiscalYear: year,
  investment: {
    hardware: { priorYears: 0, currentFiscal: 0, future: 0 },
    software: { priorYears: 0, currentFiscal: 0, future: 0 },
    consultancyVendor: { priorYears: 0, currentFiscal: 0, future: 0 },
    premisesRealEstate: { priorYears: 0, currentFiscal: 0, future: 0 },
    otherCapital: { priorYears: 0, currentFiscal: 0, future: 0 },
    expenses: { priorYears: 0, currentFiscal: 0, future: 0 }
  },
  incremental: {
    years: [year + 1, year + 2, year + 3, year + 4, year + 5],
    revenue: [0, 0, 0, 0, 0],
    savedCosts: [0, 0, 0, 0, 0],
    addlOperatingCosts: [0, 0, 0, 0, 0]
  }
});

const formatDate = (value?: string) => {
  if (!value) return "-";
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) return "-";
  return asDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const formatCurrency = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

const formatFinancialValue = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : "0";

const includes = (source: string | undefined, query: string) =>
  (source ?? "").toLowerCase().includes(query.toLowerCase());

const asTime = (value?: string) => {
  if (!value) return Number.NaN;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NaN : time;
};

const toDashboardStatus = (submission: ProjectSubmission): DashboardStatus => {
  if (submission.status === "REJECTED") return "Cancelled";
  if (submission.status === "CHANGE_REVIEW") return "On Hold";
  if (submission.status === "ACTIVE" && submission.stage === "LIVE") return "Completed";
  if (submission.stage === "PROPOSAL" && (submission.status === "DRAFT" || submission.status === "PGO_FGO_REVIEW")) {
    return "Planned";
  }
  return "In Progress";
};

const toRowModel = (submission: ProjectSubmission): RowModel => {
  const opex = Number(submission.financials?.opex ?? 0);
  const oneTime = Number(submission.financials?.oneTimeCosts ?? 0);
  const capex = Number(submission.financials?.capex ?? 0);
  const expense = Math.max(0, opex + oneTime);
  const budget = Math.max(0, capex + opex + oneTime);
  const goLiveDateRaw = submission.businessCase?.scopeSchedule?.goLive || submission.targetGoLive || undefined;
  const benefitRealizationStartDateRaw =
    submission.businessCase?.scopeSchedule?.benefitRealizationStart || undefined;

  return {
    projectId: submission.id,
    projectName: submission.title || "Untitled Project",
    projectType: submission.projectType || submission.projectTheme || submission.requestType || "-",
    segmentUnit: submission.segmentUnit || "-",
    projectManager: submission.ownerName || "-",
    projectManagerEmail: submission.ownerEmail,
    priority: submission.priority || "-",
    startDate: formatDate(submission.startDate || submission.createdAt),
    endDate: formatDate(submission.endDate),
    goLiveDate: formatDate(goLiveDateRaw),
    benefitRealizationStartDate: formatDate(benefitRealizationStartDateRaw),
    startDateRaw: submission.startDate || submission.createdAt,
    endDateRaw: submission.endDate,
    goLiveDateRaw,
    benefitRealizationStartDateRaw,
    expense,
    budget,
    budgetUtilizationPct: budget > 0 ? Math.round((expense / budget) * 100) : 0,
    status: toDashboardStatus(submission)
  };
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

export default function ProjectManagementHub({
  submissions
}: Props) {
  const [submissionsState, setSubmissionsState] = useState(submissions);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("projectId");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filters, setFilters] = useState<Filters>({
    projectId: "",
    projectName: "",
    projectType: "",
    segmentUnit: "",
    projectManager: "",
    priority: "",
    startDateFrom: "",
    endDateTo: "",
    goLiveDateFrom: "",
    benefitRealizationStartDateFrom: "",
    status: ""
  });

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSubmission, setPreviewSubmission] = useState<ProjectSubmission | null>(null);

  useEffect(() => {
    setSubmissionsState(submissions);
  }, [submissions]);

  const rows = useMemo(() => submissionsState.map(toRowModel), [submissionsState]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesId = includes(row.projectId, filters.projectId);
        const matchesName = includes(row.projectName, filters.projectName);
        const matchesType = includes(row.projectType, filters.projectType);
        const matchesSegmentUnit = includes(row.segmentUnit, filters.segmentUnit);
        const matchesManager = includes(row.projectManager, filters.projectManager);
        const matchesPriority = includes(row.priority, filters.priority);
        const matchesStatus = filters.status ? row.status === filters.status : true;

        const startTime = asTime(row.startDateRaw);
        const endTime = asTime(row.endDateRaw);
        const goLiveTime = asTime(row.goLiveDateRaw);
        const benefitRealizationStartTime = asTime(row.benefitRealizationStartDateRaw);
        const startFrom = filters.startDateFrom ? new Date(filters.startDateFrom).getTime() : Number.NaN;
        const endTo = filters.endDateTo ? new Date(filters.endDateTo).getTime() : Number.NaN;
        const goLiveFrom = filters.goLiveDateFrom ? new Date(filters.goLiveDateFrom).getTime() : Number.NaN;
        const benefitRealizationStartFrom = filters.benefitRealizationStartDateFrom
          ? new Date(filters.benefitRealizationStartDateFrom).getTime()
          : Number.NaN;

        const matchesStart = Number.isNaN(startFrom) ? true : (!Number.isNaN(startTime) && startTime >= startFrom);
        const matchesEnd = Number.isNaN(endTo) ? true : (!Number.isNaN(endTime) && endTime <= endTo);
        const matchesGoLive = Number.isNaN(goLiveFrom) ? true : (!Number.isNaN(goLiveTime) && goLiveTime >= goLiveFrom);
        const matchesBenefitRealizationStart = Number.isNaN(benefitRealizationStartFrom)
          ? true
          : (!Number.isNaN(benefitRealizationStartTime) &&
            benefitRealizationStartTime >= benefitRealizationStartFrom);

        return (
          matchesId &&
          matchesName &&
          matchesType &&
          matchesSegmentUnit &&
          matchesManager &&
          matchesPriority &&
          matchesStatus &&
          matchesStart &&
          matchesEnd &&
          matchesGoLive &&
          matchesBenefitRealizationStart
        );
      }),
    [rows, filters]
  );

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      if (sortKey === "startDate") {
        const aTime = asTime(a.startDateRaw);
        const bTime = asTime(b.startDateRaw);
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
        if (Number.isNaN(aTime)) return 1;
        if (Number.isNaN(bTime)) return -1;
        return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
      }

      if (sortKey === "endDate") {
        const aTime = asTime(a.endDateRaw);
        const bTime = asTime(b.endDateRaw);
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
        if (Number.isNaN(aTime)) return 1;
        if (Number.isNaN(bTime)) return -1;
        return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
      }

      if (sortKey === "goLiveDate") {
        const aTime = asTime(a.goLiveDateRaw);
        const bTime = asTime(b.goLiveDateRaw);
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
        if (Number.isNaN(aTime)) return 1;
        if (Number.isNaN(bTime)) return -1;
        return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
      }

      if (sortKey === "benefitRealizationStartDate") {
        const aTime = asTime(a.benefitRealizationStartDateRaw);
        const bTime = asTime(b.benefitRealizationStartDateRaw);
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
        if (Number.isNaN(aTime)) return 1;
        if (Number.isNaN(bTime)) return -1;
        return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
      }

      if (sortKey === "expense" || sortKey === "budget" || sortKey === "budgetUtilizationPct") {
        const aNumeric = Number(a[sortKey] ?? 0);
        const bNumeric = Number(b[sortKey] ?? 0);
        return sortDirection === "asc" ? aNumeric - bNumeric : bNumeric - aNumeric;
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


  const openPreview = async (projectId: string) => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewSubmission(null);

    try {
      const response = await fetch(`/api/submissions/${encodeURIComponent(projectId)}`);
      if (!response.ok) {
        throw new Error("Unable to load project preview.");
      }

      const payload = (await response.json()) as { data?: ProjectSubmission; message?: string };
      if (!payload.data) {
        throw new Error(payload.message ?? "Project details are unavailable.");
      }

      setPreviewSubmission(payload.data);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Unable to load project preview.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewLoading(false);
    setPreviewError(null);
    setPreviewSubmission(null);
  };

  const financialGridPreview = useMemo(() => {
    if (!previewSubmission) {
      return null;
    }

    if (previewSubmission.financialGrid) {
      return previewSubmission.financialGrid;
    }

    const seedYear = previewSubmission.startDate
      ? new Date(previewSubmission.startDate).getFullYear()
      : new Date(previewSubmission.createdAt).getFullYear();

    return makeFallbackFinancialGrid(Number.isFinite(seedYear) ? seedYear : new Date().getFullYear());
  }, [previewSubmission]);

  const financialDetailsPreview = useMemo(
    () => previewSubmission?.financials ?? emptyFinancialDetails,
    [previewSubmission]
  );

  const depreciationPreview = useMemo(
    () => (financialGridPreview ? calculateDepreciationOfCapitalByYear(financialGridPreview) : []),
    [financialGridPreview]
  );

  const netBenefitsPreview = useMemo(
    () => (financialGridPreview ? calculateNetBenefitsByYear(financialGridPreview, financialDetailsPreview) : []),
    [financialGridPreview, financialDetailsPreview]
  );

  const metricsPreview = useMemo(
    () => (financialGridPreview ? calculateFinancialMetrics(financialGridPreview, financialDetailsPreview) : null),
    [financialGridPreview, financialDetailsPreview]
  );

  const capitalTotalsPreview = useMemo(() => {
    if (!financialGridPreview) {
      return null;
    }

    return capitalRowKeys.reduce(
      (totals, key) => ({
        priorYears: totals.priorYears + financialGridPreview.investment[key].priorYears,
        currentFiscal: totals.currentFiscal + financialGridPreview.investment[key].currentFiscal,
        future: totals.future + financialGridPreview.investment[key].future
      }),
      { priorYears: 0, currentFiscal: 0, future: 0 }
    );
  }, [financialGridPreview]);

  const totalInvestmentTotalsPreview = useMemo(() => {
    if (!financialGridPreview || !capitalTotalsPreview) {
      return null;
    }

    return {
      priorYears: capitalTotalsPreview.priorYears + financialGridPreview.investment.expenses.priorYears,
      currentFiscal: capitalTotalsPreview.currentFiscal + financialGridPreview.investment.expenses.currentFiscal,
      future: capitalTotalsPreview.future + financialGridPreview.investment.expenses.future
    };
  }, [capitalTotalsPreview, financialGridPreview]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end px-2">
        <button
          type="button"
          onClick={() => setFiltersOpen((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs font-semibold text-brand-700 transition ${
            filtersOpen ? "opacity-100" : "opacity-90 hover:opacity-100"
          }`}
          title={filtersOpen ? "Hide filters" : "Show filters"}
          aria-label={filtersOpen ? "Hide filters" : "Show filters"}
        >
          <IconFilter />
          <span>Filter</span>
        </button>
      </div>

      <section className="overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm">
        <div className="overflow-auto">
          <table className="w-full min-w-[1480px] border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-brand-700 text-white">
              <tr className="text-xs uppercase tracking-[0.04em]">
                <th className="px-4 py-3 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("projectId")}>
                    Project ID <IconSortArrows direction={sortKey === "projectId" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("projectName")}>
                    Project Name <IconSortArrows direction={sortKey === "projectName" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("projectType")}>
                    Project Type <IconSortArrows direction={sortKey === "projectType" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("segmentUnit")}>
                    Segment - Unit <IconSortArrows direction={sortKey === "segmentUnit" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("projectManager")}>
                    Project Manager <IconSortArrows direction={sortKey === "projectManager" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("priority")}>
                    Priority <IconSortArrows direction={sortKey === "priority" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("startDate")}>
                    Start Date <IconSortArrows direction={sortKey === "startDate" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("endDate")}>
                    End Date <IconSortArrows direction={sortKey === "endDate" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("goLiveDate")}>
                    Go-Live Date <IconSortArrows direction={sortKey === "goLiveDate" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 font-semibold"
                    onClick={() => onSort("benefitRealizationStartDate")}
                  >
                    Benefit Realization Start Date{" "}
                    <IconSortArrows direction={sortKey === "benefitRealizationStartDate" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("expense")}>
                    Expense <IconSortArrows direction={sortKey === "expense" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("budget")}>
                    Budget <IconSortArrows direction={sortKey === "budget" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("budgetUtilizationPct")}>
                    Budget Utilization % <IconSortArrows direction={sortKey === "budgetUtilizationPct" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("status")}>
                    Status <IconSortArrows direction={sortKey === "status" ? sortDirection : null} />
                  </button>
                </th>
              </tr>
              {filtersOpen ? (
                <tr className="border-t border-white/20 bg-brand-800/55">
                  <th className="px-3 py-2">
                    <input
                      value={filters.projectId}
                      onChange={(event) => setFilters((prev) => ({ ...prev, projectId: event.target.value }))}
                      className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                      placeholder="Filter ID"
                    />
                  </th>
                  <th className="px-3 py-2">
                    <input
                      value={filters.projectName}
                      onChange={(event) => setFilters((prev) => ({ ...prev, projectName: event.target.value }))}
                      className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                      placeholder="Filter name"
                    />
                  </th>
                  <th className="px-3 py-2">
                    <input
                      value={filters.projectType}
                      onChange={(event) => setFilters((prev) => ({ ...prev, projectType: event.target.value }))}
                      className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                      placeholder="Filter type"
                    />
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
                      value={filters.projectManager}
                      onChange={(event) => setFilters((prev) => ({ ...prev, projectManager: event.target.value }))}
                      className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                      placeholder="Filter manager"
                    />
                  </th>
                  <th className="px-3 py-2">
                    <input
                      value={filters.priority}
                      onChange={(event) => setFilters((prev) => ({ ...prev, priority: event.target.value }))}
                      className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                      placeholder="Filter priority"
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
                    <input
                      type="date"
                      value={filters.goLiveDateFrom}
                      onChange={(event) => setFilters((prev) => ({ ...prev, goLiveDateFrom: event.target.value }))}
                      className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500"
                      title="Go-live date from"
                    />
                  </th>
                  <th className="px-3 py-2">
                    <input
                      type="date"
                      value={filters.benefitRealizationStartDateFrom}
                      onChange={(event) =>
                        setFilters((prev) => ({ ...prev, benefitRealizationStartDateFrom: event.target.value }))
                      }
                      className="w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500"
                      title="Benefit realization start from"
                    />
                  </th>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2 text-left">
                    <select
                      value={filters.status}
                      onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                      className="mb-1 w-full rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500"
                    >
                      <option value="">All statuses</option>
                      {(Object.keys(statusColor) as DashboardStatus[]).map((statusValue) => (
                        <option key={statusValue} value={statusValue}>
                          {statusValue}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setFilters({
                          projectId: "",
                          projectName: "",
                          projectType: "",
                          segmentUnit: "",
                          projectManager: "",
                          priority: "",
                          startDateFrom: "",
                          endDateTo: "",
                          goLiveDateFrom: "",
                          benefitRealizationStartDateFrom: "",
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
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={14}>
                    No projects match the current filters.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, index) => (
                  <tr
                    key={row.projectId}
                    className={`border-t border-brand-100 hover:bg-brand-50/30 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}
                  >
                    <td className="px-4 py-3 font-semibold text-brand-700">
                      <button
                        type="button"
                        onClick={() => {
                          void openPreview(row.projectId);
                        }}
                        className="text-left underline decoration-brand-300 underline-offset-2 hover:text-brand-600"
                        title="Open funding project details preview"
                      >
                        {row.projectId}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.projectName}</td>
                    <td className="px-4 py-3 text-slate-700">{row.projectType}</td>
                    <td className="px-4 py-3 text-slate-700">{row.segmentUnit}</td>
                    <td className="px-4 py-3 text-slate-700">{row.projectManager}</td>
                    <td className="px-4 py-3 text-slate-700">{row.priority}</td>
                    <td className="px-4 py-3 text-slate-700">{row.startDate}</td>
                    <td className="px-4 py-3 text-slate-700">{row.endDate}</td>
                    <td className="px-4 py-3 text-slate-700">{row.goLiveDate}</td>
                    <td className="px-4 py-3 text-slate-700">{row.benefitRealizationStartDate}</td>
                    <td className="px-4 py-3 text-slate-700">{formatCurrency(row.expense)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatCurrency(row.budget)}</td>
                    <td className="px-4 py-3 text-slate-700">{row.budgetUtilizationPct}%</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-slate-700">
                        <span className={`h-3 w-3 rounded-full ${statusColor[row.status]}`} />
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-6xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {isFundingStageSubmission(previewSubmission) ? "Funding Request Preview" : "Proposal Preview"}
                </h3>
                <p className="text-sm text-slate-600">
                  {previewSubmission?.id ?? "--"} · {previewSubmission?.title ?? "Loading"}
                </p>
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="max-h-[82vh] overflow-y-auto px-5 py-4">
              {previewLoading ? (
                <p className="text-sm text-slate-600">Loading project preview...</p>
              ) : previewError ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {previewError}
                </p>
              ) : !previewSubmission ? (
                <p className="text-sm text-slate-600">Project details are unavailable.</p>
              ) : isFundingStageSubmission(previewSubmission) ? (
                <div className="space-y-4">
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Read-only funding request preview. This view shows Section A and summary tables for Sections B, C, and D.
                  </p>
                  <FundingRequestPreviewSummary submission={previewSubmission} />
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Read-only proposal preview. Stage:{" "}
                    <span className="font-semibold text-slate-800">{previewSubmission.stage}</span>
                  </p>

                  <section className="rounded-lg border border-slate-200 bg-white p-4">
                    <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-slate-700">
                      A. Overview
                    </h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Project Name</p>
                        <p className="text-sm font-medium text-slate-900">{previewSubmission.title || "-"}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Project ID</p>
                        <p className="text-sm font-medium text-slate-900">{previewSubmission.id}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Project Description</p>
                        <p className="whitespace-pre-wrap text-sm text-slate-900">{previewSubmission.summary || "-"}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Financial Benefits and Assumptions</p>
                        <p className="whitespace-pre-wrap text-sm text-slate-900">
                          {previewSubmission.benefits.financialAssumptions || "-"}
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Intangible Benefits and Assumptions</p>
                        <p className="whitespace-pre-wrap text-sm text-slate-900">
                          {previewSubmission.benefits.intangibleAssumptions || "-"}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white p-4">
                    <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-slate-700">
                      B. Sponsor & Timeline
                    </h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Project Manager</p>
                        <p className="text-sm font-medium text-slate-900">{previewSubmission.ownerName || "-"}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Business Sponsor</p>
                        <p className="text-sm font-medium text-slate-900">
                          {previewSubmission.businessSponsor || previewSubmission.sponsorName || "-"}
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Executive Sponsor</p>
                        <p className="text-sm font-medium text-slate-900">{previewSubmission.executiveSponsor || "-"}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Segment - Unit</p>
                        <p className="text-sm font-medium text-slate-900">{previewSubmission.segmentUnit || "-"}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Start Date</p>
                        <p className="text-sm font-medium text-slate-900">{formatDate(previewSubmission.startDate)}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Closure Date</p>
                        <p className="text-sm font-medium text-slate-900">{formatDate(previewSubmission.endDate)}</p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white p-4">
                    <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-slate-700">
                      C. Characteristics
                    </h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Project Category</p>
                        <p className="text-sm font-medium text-slate-900">{previewSubmission.category || "-"}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Project Theme</p>
                        <p className="text-sm font-medium text-slate-900">{previewSubmission.projectTheme || "-"}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Strategic Objective</p>
                        <p className="text-sm font-medium text-slate-900">{previewSubmission.strategicObjective || "-"}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Specific Project Classification Type</p>
                        <p className="text-sm font-medium text-slate-900">{previewSubmission.specificClassificationType || "-"}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Project Classification</p>
                        <p className="text-sm font-medium text-slate-900">{previewSubmission.projectClassification || "-"}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Project Type</p>
                        <p className="text-sm font-medium text-slate-900">{previewSubmission.projectType || "-"}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">CIBC Enterprise Project Theme</p>
                        <p className="text-sm font-medium text-slate-900">{previewSubmission.enterpriseProjectTheme || "-"}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Portfolio ESC</p>
                        <p className="text-sm font-medium text-slate-900">
                          {previewSubmission.portfolioEsc || previewSubmission.enterpriseProjectTheme || "-"}
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Funding Source</p>
                        <p className="text-sm font-medium text-slate-900">
                          {previewSubmission.businessCase?.introduction.fundingSource || "-"}
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Funding Type</p>
                        <p className="text-sm font-medium text-slate-900">
                          {previewSubmission.businessCase?.introduction.fundingType || "-"}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white p-4">
                    <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-slate-700">
                      D. Financials
                    </h4>

                    {!financialGridPreview || !capitalTotalsPreview || !totalInvestmentTotalsPreview ? (
                      <p className="text-sm text-slate-600">No financial data available.</p>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <h5 className="mb-2 text-sm font-semibold text-slate-900">Total Investment (US &#39;000s)</h5>
                          <table className="w-full table-fixed border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-100 text-slate-700">
                                <th className="w-[36%] border border-slate-200 px-2 py-1 text-left">Line Item</th>
                                <th className="border border-slate-200 px-2 py-1 text-center">Prior Yrs</th>
                                <th className="border border-slate-200 px-2 py-1 text-center">F{financialGridPreview.commencementFiscalYear}</th>
                                <th className="border border-slate-200 px-2 py-1 text-center">Future</th>
                                <th className="border border-slate-200 px-2 py-1 text-center">Life</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="bg-slate-100 font-semibold text-slate-900">
                                <td className="border border-slate-200 px-2 py-1">Capital</td>
                                <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(capitalTotalsPreview.priorYears)}</td>
                                <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(capitalTotalsPreview.currentFiscal)}</td>
                                <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(capitalTotalsPreview.future)}</td>
                                <td className="border border-slate-200 px-2 py-1 text-center">
                                  {formatFinancialValue(
                                    capitalTotalsPreview.priorYears +
                                      capitalTotalsPreview.currentFiscal +
                                      capitalTotalsPreview.future
                                  )}
                                </td>
                              </tr>
                              {investmentRows.map((row) => {
                                const rowValues = financialGridPreview.investment[row.key];
                                const rowLife = rowValues.priorYears + rowValues.currentFiscal + rowValues.future;
                                const rowClass =
                                  row.key === "expenses" ? "font-semibold text-slate-900" : "text-slate-700";

                                return (
                                  <tr key={row.key} className={rowClass}>
                                    <td className="border border-slate-200 px-2 py-1">{row.label}</td>
                                    <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(rowValues.priorYears)}</td>
                                    <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(rowValues.currentFiscal)}</td>
                                    <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(rowValues.future)}</td>
                                    <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(rowLife)}</td>
                                  </tr>
                                );
                              })}
                              <tr className="bg-slate-100 font-semibold text-slate-900">
                                <td className="border border-slate-200 px-2 py-1">Total Investment</td>
                                <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(totalInvestmentTotalsPreview.priorYears)}</td>
                                <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(totalInvestmentTotalsPreview.currentFiscal)}</td>
                                <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(totalInvestmentTotalsPreview.future)}</td>
                                <td className="border border-slate-200 px-2 py-1 text-center">
                                  {formatFinancialValue(
                                    totalInvestmentTotalsPreview.priorYears +
                                      totalInvestmentTotalsPreview.currentFiscal +
                                      totalInvestmentTotalsPreview.future
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div>
                          <h5 className="mb-2 text-sm font-semibold text-slate-900">Incremental Revenue &amp; Cost (US &#39;000s)</h5>
                          <table className="w-full table-fixed border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-100 text-slate-700">
                                <th className="w-[30%] border border-slate-200 px-2 py-1 text-left">Line Item</th>
                                {financialGridPreview.incremental.years.map((year) => (
                                  <th key={year} className="border border-slate-200 px-2 py-1 text-center">
                                    F{year}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="border border-slate-200 px-2 py-1 text-slate-700">Revenue</td>
                                {financialGridPreview.incremental.revenue.map((value, index) => (
                                  <td key={`pm-prev-revenue-${index}`} className="border border-slate-200 px-2 py-1 text-center">
                                    {formatFinancialValue(value)}
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td className="border border-slate-200 px-2 py-1 text-slate-700">Saved Costs</td>
                                {financialGridPreview.incremental.savedCosts.map((value, index) => (
                                  <td key={`pm-prev-saved-${index}`} className="border border-slate-200 px-2 py-1 text-center">
                                    {formatFinancialValue(value)}
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td className="border border-slate-200 px-2 py-1 text-slate-700">Additional Operating Costs</td>
                                {financialGridPreview.incremental.addlOperatingCosts.map((value, index) => (
                                  <td key={`pm-prev-ops-${index}`} className="border border-slate-200 px-2 py-1 text-center">
                                    {formatFinancialValue(value)}
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td className="border border-slate-200 px-2 py-1 text-slate-700">Depreciation of Capital</td>
                                {depreciationPreview.map((value, index) => (
                                  <td key={`pm-prev-dep-${index}`} className="border border-slate-200 px-2 py-1 text-center">
                                    {formatFinancialValue(value)}
                                  </td>
                                ))}
                              </tr>
                              <tr className="bg-slate-100 font-semibold text-slate-900">
                                <td className="border border-slate-200 px-2 py-1">Net Benefits</td>
                                {netBenefitsPreview.map((value, index) => (
                                  <td key={`pm-prev-net-${index}`} className="border border-slate-200 px-2 py-1 text-center">
                                    {formatFinancialValue(value)}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Payback (Yrs)</p>
                            <p className="text-sm font-semibold text-slate-900">{metricsPreview?.paybackLabel ?? "-"}</p>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">NPV</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {metricsPreview ? formatFinancialValue(metricsPreview.npv) : "-"}
                            </p>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">IRR (%)</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {metricsPreview?.irrPct === null
                                ? "N/A"
                                : metricsPreview
                                  ? formatFinancialValue(metricsPreview.irrPct)
                                  : "-"}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
