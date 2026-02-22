"use client";

import { useMemo, useState } from "react";

import {
  calculateDepreciationOfCapitalByYear,
  calculateFinancialMetrics,
  calculateNetBenefitsByYear
} from "@/lib/submissions/financial-metrics";
import FundingRequestPreviewSummary from "@/components/submissions/funding-request-preview-summary";
import type { FinancialGrid, ProjectSubmission } from "@/lib/submissions/types";
import {
  SPO_COMMITTEE_DECISIONS,
  type SpoCommitteeDecision,
  type SpoCommitteeRow,
  type SpoCommitteeState
} from "@/lib/spo-committee/types";

type Props = {
  initialData: SpoCommitteeState;
};

type SortKey =
  | "projectId"
  | "projectName"
  | "startDate"
  | "endDate"
  | "businessSponsor"
  | "segmentUnit"
  | "portfolioEsc"
  | "fundingType"
  | "fundingSource"
  | "projectClassification"
  | "projectTheme"
  | "projectCategory"
  | "strategicObjective"
  | "currentFiscalCapex"
  | "currentFiscalExpense"
  | "currentFiscalTotal"
  | "currentFiscalNibt"
  | "npv5Year"
  | "decision"
  | "comment"
  | "updatedAt";

type SortDirection = "asc" | "desc";

type Filters = {
  projectId: string;
  projectName: string;
  businessSponsor: string;
  segmentUnit: string;
  portfolioEsc: string;
  fundingType: string;
  fundingSource: string;
  projectClassification: string;
  projectTheme: string;
  projectCategory: string;
  strategicObjective: string;
  decision: string;
  comment: string;
};

type VersionSortKey = "projectId" | "projectName" | "decision" | "comment" | "updatedAt";

type VersionFilters = {
  projectId: string;
  projectName: string;
  decision: string;
  comment: string;
};

type PlanningSummaryRow = {
  label: string;
  carryForwardCapex: number;
  carryForwardExpense: number;
  carryForwardTotal: number;
  netNewCapex: number;
  netNewExpense: number;
  netNewTotal: number;
  proposedCapex: number;
  proposedExpense: number;
  proposedTotal: number;
};

type PlanningSummaryTable = {
  rows: PlanningSummaryRow[];
  totals: Omit<PlanningSummaryRow, "label">;
  portfolioEffect: {
    capex: number;
    expense: number;
    total: number;
  };
  finalTotal: {
    capex: number;
    expense: number;
    total: number;
  };
};

type PlanningFinalTotals = {
  capex: number;
  expense: number;
  total: number;
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
    submission.stage === "Funding Request" ||
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

const includes = (source: string | undefined, query: string) =>
  (source ?? "").toLowerCase().includes(query.toLowerCase());

const asTime = (value?: string) => {
  if (!value) return Number.NaN;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NaN : time;
};

const numericSortKeys = new Set<SortKey>([
  "currentFiscalCapex",
  "currentFiscalExpense",
  "currentFiscalTotal",
  "currentFiscalNibt",
  "npv5Year"
]);

const dateSortKeys = new Set<SortKey>(["startDate", "endDate", "updatedAt"]);

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const formatDate = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const formatFinancialValue = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : "0";
const formatVarianceValue = (value: number) => {
  const formatted = formatFinancialValue(Math.abs(value));
  return value < 0 ? `(${formatted})` : formatted;
};
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const parseNumberInput = (value: string) => {
  if (value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? round2(parsed) : 0;
};
const defaultFundingAvailabilityTarget: PlanningFinalTotals = {
  capex: 40000,
  expense: 8000,
  total: 48000
};
const buildPlanningSummary = (
  sourceRows: SpoCommitteeRow[],
  keySelector: (row: SpoCommitteeRow) => string,
  finalTotalTargets: PlanningFinalTotals
): PlanningSummaryTable => {
  const grouped = sourceRows.reduce((map, row) => {
    const label = keySelector(row).trim();
    if (!label || label === "-") {
      return map;
    }

    const existing = map.get(label) ?? {
      label,
      carryForwardCapex: 0,
      carryForwardExpense: 0,
      carryForwardTotal: 0,
      netNewCapex: 0,
      netNewExpense: 0,
      netNewTotal: 0,
      proposedCapex: 0,
      proposedExpense: 0,
      proposedTotal: 0
    };

    existing.carryForwardCapex += Number.isFinite(row.carryForwardCapex) ? row.carryForwardCapex : 0;
    existing.carryForwardExpense += Number.isFinite(row.carryForwardExpense) ? row.carryForwardExpense : 0;
    existing.carryForwardTotal += Number.isFinite(row.carryForwardTotal) ? row.carryForwardTotal : 0;
    existing.netNewCapex += Number.isFinite(row.currentFiscalCapex) ? row.currentFiscalCapex : 0;
    existing.netNewExpense += Number.isFinite(row.currentFiscalExpense) ? row.currentFiscalExpense : 0;
    existing.netNewTotal += Number.isFinite(row.currentFiscalTotal) ? row.currentFiscalTotal : 0;
    existing.proposedCapex = existing.carryForwardCapex + existing.netNewCapex;
    existing.proposedExpense = existing.carryForwardExpense + existing.netNewExpense;
    existing.proposedTotal = existing.carryForwardTotal + existing.netNewTotal;

    map.set(label, existing);
    return map;
  }, new Map<string, PlanningSummaryRow>());

  const rows = Array.from(grouped.values())
    .map((row) => ({
      ...row,
      carryForwardCapex: round2(row.carryForwardCapex),
      carryForwardExpense: round2(row.carryForwardExpense),
      carryForwardTotal: round2(row.carryForwardTotal),
      netNewCapex: round2(row.netNewCapex),
      netNewExpense: round2(row.netNewExpense),
      netNewTotal: round2(row.netNewTotal),
      proposedCapex: round2(row.proposedCapex),
      proposedExpense: round2(row.proposedExpense),
      proposedTotal: round2(row.proposedTotal)
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  const totals = rows.reduce<Omit<PlanningSummaryRow, "label">>(
    (acc, row) => ({
      carryForwardCapex: acc.carryForwardCapex + row.carryForwardCapex,
      carryForwardExpense: acc.carryForwardExpense + row.carryForwardExpense,
      carryForwardTotal: acc.carryForwardTotal + row.carryForwardTotal,
      netNewCapex: acc.netNewCapex + row.netNewCapex,
      netNewExpense: acc.netNewExpense + row.netNewExpense,
      netNewTotal: acc.netNewTotal + row.netNewTotal,
      proposedCapex: acc.proposedCapex + row.proposedCapex,
      proposedExpense: acc.proposedExpense + row.proposedExpense,
      proposedTotal: acc.proposedTotal + row.proposedTotal
    }),
    {
      carryForwardCapex: 0,
      carryForwardExpense: 0,
      carryForwardTotal: 0,
      netNewCapex: 0,
      netNewExpense: 0,
      netNewTotal: 0,
      proposedCapex: 0,
      proposedExpense: 0,
      proposedTotal: 0
    }
  );

  const roundedTotals = {
    carryForwardCapex: round2(totals.carryForwardCapex),
    carryForwardExpense: round2(totals.carryForwardExpense),
    carryForwardTotal: round2(totals.carryForwardTotal),
    netNewCapex: round2(totals.netNewCapex),
    netNewExpense: round2(totals.netNewExpense),
    netNewTotal: round2(totals.netNewTotal),
    proposedCapex: round2(totals.proposedCapex),
    proposedExpense: round2(totals.proposedExpense),
    proposedTotal: round2(totals.proposedTotal)
  };

  return {
    rows,
    totals: roundedTotals,
    portfolioEffect: {
      capex: round2(finalTotalTargets.capex - roundedTotals.proposedCapex),
      expense: round2(finalTotalTargets.expense - roundedTotals.proposedExpense),
      total: round2(finalTotalTargets.total - roundedTotals.proposedTotal)
    },
    finalTotal: {
      capex: round2(finalTotalTargets.capex),
      expense: round2(finalTotalTargets.expense),
      total: round2(finalTotalTargets.total)
    }
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

export default function SpoCommitteeHub({ initialData }: Props) {
  const [rows, setRows] = useState(initialData.rows);
  const [versions, setVersions] = useState(initialData.versions);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("projectId");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filters, setFilters] = useState<Filters>({
    projectId: "",
    projectName: "",
    businessSponsor: "",
    segmentUnit: "",
    portfolioEsc: "",
    fundingType: "",
    fundingSource: "",
    projectClassification: "",
    projectTheme: "",
    projectCategory: "",
    strategicObjective: "",
    decision: "",
    comment: ""
  });
  const [selectedVersionId, setSelectedVersionId] = useState(initialData.versions[0]?.id ?? "");
  const [versionFiltersOpen, setVersionFiltersOpen] = useState(false);
  const [versionSortKey, setVersionSortKey] = useState<VersionSortKey>("updatedAt");
  const [versionSortDirection, setVersionSortDirection] = useState<SortDirection>("desc");
  const [versionFilters, setVersionFilters] = useState<VersionFilters>({
    projectId: "",
    projectName: "",
    decision: "",
    comment: ""
  });
  const [planningFinalTotals, setPlanningFinalTotals] = useState<PlanningFinalTotals>(
    defaultFundingAvailabilityTarget
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSubmission, setPreviewSubmission] = useState<ProjectSubmission | null>(null);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? versions[0],
    [selectedVersionId, versions]
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        return (
          includes(row.projectId, filters.projectId) &&
          includes(row.projectName, filters.projectName) &&
          includes(row.businessSponsor, filters.businessSponsor) &&
          includes(row.segmentUnit, filters.segmentUnit) &&
          includes(row.portfolioEsc, filters.portfolioEsc) &&
          includes(row.fundingType, filters.fundingType) &&
          includes(row.fundingSource, filters.fundingSource) &&
          includes(row.projectClassification, filters.projectClassification) &&
          includes(row.projectTheme, filters.projectTheme) &&
          includes(row.projectCategory, filters.projectCategory) &&
          includes(row.strategicObjective, filters.strategicObjective) &&
          (filters.decision ? row.decision === filters.decision : true) &&
          includes(row.comment, filters.comment)
        );
      }),
    [filters, rows]
  );

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      if (dateSortKeys.has(sortKey)) {
        const aTime = asTime(a.updatedAt);
        const bTime = asTime(b.updatedAt);
        if (sortKey === "startDate") {
          const aStartTime = asTime(a.startDate);
          const bStartTime = asTime(b.startDate);
          if (Number.isNaN(aStartTime) && Number.isNaN(bStartTime)) return 0;
          if (Number.isNaN(aStartTime)) return 1;
          if (Number.isNaN(bStartTime)) return -1;
          return sortDirection === "asc" ? aStartTime - bStartTime : bStartTime - aStartTime;
        }
        if (sortKey === "endDate") {
          const aEndTime = asTime(a.endDate);
          const bEndTime = asTime(b.endDate);
          if (Number.isNaN(aEndTime) && Number.isNaN(bEndTime)) return 0;
          if (Number.isNaN(aEndTime)) return 1;
          if (Number.isNaN(bEndTime)) return -1;
          return sortDirection === "asc" ? aEndTime - bEndTime : bEndTime - aEndTime;
        }
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
        if (Number.isNaN(aTime)) return 1;
        if (Number.isNaN(bTime)) return -1;
        return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
      }

      if (numericSortKeys.has(sortKey)) {
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

  const summaryByProjectTheme = useMemo(
    () => buildPlanningSummary(rows, (row) => row.projectTheme, planningFinalTotals),
    [rows, planningFinalTotals]
  );
  const summaryByBusinessSponsor = useMemo(
    () => buildPlanningSummary(rows, (row) => row.businessSponsor, planningFinalTotals),
    [rows, planningFinalTotals]
  );

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const onVersionSort = (key: VersionSortKey) => {
    if (versionSortKey === key) {
      setVersionSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setVersionSortKey(key);
    setVersionSortDirection("asc");
  };

  const selectedVersionRows = useMemo(() => selectedVersion?.rows ?? [], [selectedVersion]);

  const filteredVersionRows = useMemo(
    () =>
      selectedVersionRows.filter((row) => {
        return (
          includes(row.projectId, versionFilters.projectId) &&
          includes(row.projectName, versionFilters.projectName) &&
          (versionFilters.decision ? row.decision === versionFilters.decision : true) &&
          includes(row.comment, versionFilters.comment)
        );
      }),
    [selectedVersionRows, versionFilters]
  );

  const sortedVersionRows = useMemo(() => {
    const copy = [...filteredVersionRows];
    copy.sort((a, b) => {
      if (versionSortKey === "updatedAt") {
        const aTime = asTime(a.updatedAt);
        const bTime = asTime(b.updatedAt);
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
        if (Number.isNaN(aTime)) return 1;
        if (Number.isNaN(bTime)) return -1;
        return versionSortDirection === "asc" ? aTime - bTime : bTime - aTime;
      }

      const aValue = String(a[versionSortKey] ?? "").toLowerCase();
      const bValue = String(b[versionSortKey] ?? "").toLowerCase();
      const comparison = aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: "base" });
      return versionSortDirection === "asc" ? comparison : -comparison;
    });
    return copy;
  }, [filteredVersionRows, versionSortDirection, versionSortKey]);

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
    () =>
      financialGridPreview
        ? calculateNetBenefitsByYear(financialGridPreview, financialDetailsPreview)
        : [],
    [financialGridPreview, financialDetailsPreview]
  );

  const metricsPreview = useMemo(
    () =>
      financialGridPreview
        ? calculateFinancialMetrics(financialGridPreview, financialDetailsPreview)
        : null,
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
  }, [financialGridPreview, capitalTotalsPreview]);

  const updateDecision = (projectId: string, decision: SpoCommitteeDecision) => {
    setRows((prev) => prev.map((row) => (row.projectId === projectId ? { ...row, decision } : row)));
  };

  const updateComment = (projectId: string, comment: string) => {
    setRows((prev) => prev.map((row) => (row.projectId === projectId ? { ...row, comment } : row)));
  };

  const updatePlanningFinalTotal = (key: keyof PlanningFinalTotals, value: string) => {
    setPlanningFinalTotals((prev) => ({
      ...prev,
      [key]: parseNumberInput(value)
    }));
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewLoading(false);
    setPreviewError(null);
    setPreviewSubmission(null);
  };

  const openPreview = async (projectId: string) => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewSubmission(null);

    try {
      const response = await fetch(`/api/submissions/${encodeURIComponent(projectId)}`);
      const payload = (await response.json().catch(() => null)) as { data?: ProjectSubmission; message?: string } | null;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.message ?? "Unable to load project preview.");
      }

      setPreviewSubmission(payload.data);
    } catch (previewLoadError) {
      const text =
        previewLoadError instanceof Error
          ? previewLoadError.message
          : "Unable to load project preview.";
      setPreviewError(text);
    } finally {
      setPreviewLoading(false);
    }
  };

  const saveAll = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/spo-committee", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: rows.map((row) => ({
            projectId: row.projectId,
            decision: row.decision,
            comment: row.comment
          }))
        })
      });

      const payload = (await response.json()) as { message?: string; data?: SpoCommitteeState };
      if (!response.ok || !payload.data) {
        throw new Error(payload.message ?? "Unable to save SPO Committee table.");
      }

      setRows(payload.data.rows);
      setVersions(payload.data.versions);
      setSelectedVersionId(payload.data.versions[0]?.id ?? "");
      setMessage(`Saved ${formatDateTime(payload.data.versions[0]?.savedAt)}.`);
    } catch (saveError) {
      const text = saveError instanceof Error ? saveError.message : "Unable to save SPO Committee table.";
      setError(text);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">SPO Committee Hub</h2>
            <p className="mt-1 text-sm text-slate-600">
              Record committee outcomes by project and keep versioned snapshots of each save.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => {
                void saveAll();
              }}
              disabled={saving}
              className="rounded-md accent-bg px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save All Changes"}
            </button>
            <p className="text-xs text-slate-500">Last saved: {formatDateTime(versions[0]?.savedAt)}</p>
          </div>
        </div>

        {message ? (
          <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="mt-4 flex items-center justify-end px-1">
          <div className="flex w-[120px] justify-start">
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
        </div>

        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[3200px] border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-brand-700 text-white">
              <tr className="text-xs uppercase tracking-[0.04em]">
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("projectId")}>
                    Project ID <IconSortArrows direction={sortKey === "projectId" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("projectName")}>
                    Project Name <IconSortArrows direction={sortKey === "projectName" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("startDate")}>
                    Start Date <IconSortArrows direction={sortKey === "startDate" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("endDate")}>
                    End Date <IconSortArrows direction={sortKey === "endDate" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("businessSponsor")}>
                    Business Sponsor <IconSortArrows direction={sortKey === "businessSponsor" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("segmentUnit")}>
                    Segment - Unit <IconSortArrows direction={sortKey === "segmentUnit" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("portfolioEsc")}>
                    Portfolio ESC <IconSortArrows direction={sortKey === "portfolioEsc" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("fundingType")}>
                    Funding Type <IconSortArrows direction={sortKey === "fundingType" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("fundingSource")}>
                    Funding Source <IconSortArrows direction={sortKey === "fundingSource" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 font-semibold"
                    onClick={() => onSort("projectClassification")}
                  >
                    Project Classification <IconSortArrows direction={sortKey === "projectClassification" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("projectTheme")}>
                    Project Theme <IconSortArrows direction={sortKey === "projectTheme" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("projectCategory")}>
                    Project Category <IconSortArrows direction={sortKey === "projectCategory" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 font-semibold"
                    onClick={() => onSort("strategicObjective")}
                  >
                    Strategic Objective <IconSortArrows direction={sortKey === "strategicObjective" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 font-semibold"
                    onClick={() => onSort("currentFiscalCapex")}
                  >
                    Current Fiscal Capex <IconSortArrows direction={sortKey === "currentFiscalCapex" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 font-semibold"
                    onClick={() => onSort("currentFiscalExpense")}
                  >
                    Current Fiscal Expense <IconSortArrows direction={sortKey === "currentFiscalExpense" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 font-semibold"
                    onClick={() => onSort("currentFiscalTotal")}
                  >
                    Current Fiscal Total <IconSortArrows direction={sortKey === "currentFiscalTotal" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 font-semibold"
                    onClick={() => onSort("currentFiscalNibt")}
                  >
                    Current Fiscal NIBT <IconSortArrows direction={sortKey === "currentFiscalNibt" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("npv5Year")}>
                    NPV (5 Yr) <IconSortArrows direction={sortKey === "npv5Year" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("decision")}>
                    Committee Decision <IconSortArrows direction={sortKey === "decision" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("comment")}>
                    Comment <IconSortArrows direction={sortKey === "comment" ? sortDirection : null} />
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onSort("updatedAt")}>
                    Updated <IconSortArrows direction={sortKey === "updatedAt" ? sortDirection : null} />
                  </button>
                </th>
              </tr>
              {filtersOpen ? (
                <tr className="border-t border-white/20 bg-brand-800/55">
                  <th className="px-3 py-2" colSpan={21}>
                    <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-6">
                      <input
                        value={filters.projectId}
                        onChange={(event) => setFilters((prev) => ({ ...prev, projectId: event.target.value }))}
                        className="rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                        placeholder="Filter ID"
                      />
                      <input
                        value={filters.projectName}
                        onChange={(event) => setFilters((prev) => ({ ...prev, projectName: event.target.value }))}
                        className="rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                        placeholder="Filter project"
                      />
                      <input
                        value={filters.businessSponsor}
                        onChange={(event) => setFilters((prev) => ({ ...prev, businessSponsor: event.target.value }))}
                        className="rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                        placeholder="Filter sponsor"
                      />
                      <input
                        value={filters.segmentUnit}
                        onChange={(event) => setFilters((prev) => ({ ...prev, segmentUnit: event.target.value }))}
                        className="rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                        placeholder="Filter segment"
                      />
                      <input
                        value={filters.portfolioEsc}
                        onChange={(event) => setFilters((prev) => ({ ...prev, portfolioEsc: event.target.value }))}
                        className="rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                        placeholder="Filter portfolio ESC"
                      />
                      <input
                        value={filters.fundingType}
                        onChange={(event) => setFilters((prev) => ({ ...prev, fundingType: event.target.value }))}
                        className="rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                        placeholder="Filter funding type"
                      />
                      <input
                        value={filters.fundingSource}
                        onChange={(event) => setFilters((prev) => ({ ...prev, fundingSource: event.target.value }))}
                        className="rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                        placeholder="Filter funding source"
                      />
                      <input
                        value={filters.projectClassification}
                        onChange={(event) =>
                          setFilters((prev) => ({ ...prev, projectClassification: event.target.value }))
                        }
                        className="rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                        placeholder="Filter classification"
                      />
                      <input
                        value={filters.projectTheme}
                        onChange={(event) => setFilters((prev) => ({ ...prev, projectTheme: event.target.value }))}
                        className="rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                        placeholder="Filter theme"
                      />
                      <input
                        value={filters.projectCategory}
                        onChange={(event) => setFilters((prev) => ({ ...prev, projectCategory: event.target.value }))}
                        className="rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                        placeholder="Filter category"
                      />
                      <input
                        value={filters.strategicObjective}
                        onChange={(event) =>
                          setFilters((prev) => ({ ...prev, strategicObjective: event.target.value }))
                        }
                        className="rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                        placeholder="Filter objective"
                      />
                      <select
                        value={filters.decision}
                        onChange={(event) => setFilters((prev) => ({ ...prev, decision: event.target.value }))}
                        className="rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500"
                      >
                        <option value="">All decisions</option>
                        {SPO_COMMITTEE_DECISIONS.map((decision) => (
                          <option key={decision} value={decision}>
                            {decision}
                          </option>
                        ))}
                      </select>
                      <input
                        value={filters.comment}
                        onChange={(event) => setFilters((prev) => ({ ...prev, comment: event.target.value }))}
                        className="rounded border border-white/35 bg-white/90 px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                        placeholder="Filter comment"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setFilters({
                            projectId: "",
                            projectName: "",
                            businessSponsor: "",
                            segmentUnit: "",
                            portfolioEsc: "",
                            fundingType: "",
                            fundingSource: "",
                            projectClassification: "",
                            projectTheme: "",
                            projectCategory: "",
                            strategicObjective: "",
                            decision: "",
                            comment: ""
                          })
                        }
                        className="rounded border border-white/45 bg-white/90 px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white"
                      >
                        Clear Filters
                      </button>
                    </div>
                  </th>
                </tr>
              ) : null}
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={21} className="px-3 py-8 text-left text-slate-500">
                    No records match the current filters.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, index) => (
                  <tr key={row.projectId} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                    <td className="border-t border-slate-100 px-3 py-2 font-semibold text-brand-700">
                      <button
                        type="button"
                        onClick={() => {
                          void openPreview(row.projectId);
                        }}
                        className="text-left underline decoration-brand-300 underline-offset-2 hover:text-brand-600"
                        title="Open read-only project preview"
                      >
                        {row.projectId}
                      </button>
                    </td>
                    <td className="border-t border-slate-100 px-3 py-2">{row.projectName}</td>
                    <td className="border-t border-slate-100 px-3 py-2">{formatDate(row.startDate)}</td>
                    <td className="border-t border-slate-100 px-3 py-2">{formatDate(row.endDate)}</td>
                    <td className="border-t border-slate-100 px-3 py-2">{row.businessSponsor}</td>
                    <td className="border-t border-slate-100 px-3 py-2">{row.segmentUnit}</td>
                    <td className="border-t border-slate-100 px-3 py-2">{row.portfolioEsc}</td>
                    <td className="border-t border-slate-100 px-3 py-2">{row.fundingType}</td>
                    <td className="border-t border-slate-100 px-3 py-2">{row.fundingSource}</td>
                    <td className="border-t border-slate-100 px-3 py-2">{row.projectClassification}</td>
                    <td className="border-t border-slate-100 px-3 py-2">{row.projectTheme}</td>
                    <td className="border-t border-slate-100 px-3 py-2">{row.projectCategory}</td>
                    <td className="border-t border-slate-100 px-3 py-2">{row.strategicObjective}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">
                      {formatFinancialValue(row.currentFiscalCapex)}
                    </td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">
                      {formatFinancialValue(row.currentFiscalExpense)}
                    </td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">
                      {formatFinancialValue(row.currentFiscalTotal)}
                    </td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">
                      {formatFinancialValue(row.currentFiscalNibt)}
                    </td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.npv5Year)}</td>
                    <td className="border-t border-slate-100 px-3 py-2">
                      <select
                        value={row.decision}
                        onChange={(event) => updateDecision(row.projectId, event.target.value as SpoCommitteeDecision)}
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      >
                        <option value="">Select decision</option>
                        {SPO_COMMITTEE_DECISIONS.map((decision) => (
                          <option key={decision} value={decision}>
                            {decision}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-t border-slate-100 px-3 py-2">
                      <input
                        value={row.comment}
                        onChange={(event) => updateComment(row.projectId, event.target.value)}
                        placeholder="Add SPO committee note"
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                      {formatDateTime(row.updatedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">SPO Planning Summary</h3>
          <p className="mt-1 text-sm text-slate-600">
            Auto-populated from the SPO Committee Hub project table.
          </p>
        </div>

        <div className="space-y-6">
          <article className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-max min-w-[1080px] border-separate border-spacing-0 border border-slate-200 text-left text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="w-72 px-3 py-2 font-semibold" rowSpan={2}>
                    Class / Project Theme
                  </th>
                  <th className="px-3 py-2 text-center font-semibold" colSpan={3}>
                    Carry Forward to Current Fiscal
                  </th>
                  <th className="px-3 py-2 text-center font-semibold" colSpan={3}>
                    Current Fiscal Net New
                  </th>
                  <th className="px-3 py-2 text-center font-semibold" colSpan={3}>
                    Current Fiscal Proposed Plan
                  </th>
                </tr>
                <tr className="text-xs uppercase tracking-[0.04em] text-slate-600">
                  <th className="w-24 px-3 py-2 text-right font-semibold">Capex</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Expense</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Total</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Capex</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Expense</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Total</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Capex</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Expense</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {summaryByProjectTheme.rows.map((row, index) => (
                  <tr key={`summary-theme-${row.label}`} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                    <td className="border-t border-slate-100 px-3 py-2">{row.label}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.carryForwardCapex)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.carryForwardExpense)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.carryForwardTotal)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.netNewCapex)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.netNewExpense)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.netNewTotal)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.proposedCapex)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.proposedExpense)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.proposedTotal)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-semibold">
                  <td className="border-t border-slate-200 px-3 py-2">Totals</td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByProjectTheme.totals.carryForwardCapex)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByProjectTheme.totals.carryForwardExpense)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByProjectTheme.totals.carryForwardTotal)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByProjectTheme.totals.netNewCapex)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByProjectTheme.totals.netNewExpense)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByProjectTheme.totals.netNewTotal)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByProjectTheme.totals.proposedCapex)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByProjectTheme.totals.proposedExpense)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByProjectTheme.totals.proposedTotal)}
                  </td>
                </tr>
                <tr>
                  <td className="border-t border-slate-200 px-3 py-2 font-semibold text-slate-700">Portfolio Effect</td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right" colSpan={6} />
                  <td className="border-t border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                    {formatVarianceValue(summaryByProjectTheme.portfolioEffect.capex)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                    {formatVarianceValue(summaryByProjectTheme.portfolioEffect.expense)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                    {formatVarianceValue(summaryByProjectTheme.portfolioEffect.total)}
                  </td>
                </tr>
                <tr className="bg-slate-50 font-semibold">
                  <td className="border-t border-slate-200 px-3 py-2">Final Total</td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right" colSpan={6} />
                  <td className="border-t border-slate-200 px-3 py-1 text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={summaryByProjectTheme.finalTotal.capex}
                      onChange={(event) => updatePlanningFinalTotal("capex", event.target.value)}
                      className="ml-auto block w-24 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm font-semibold"
                    />
                  </td>
                  <td className="border-t border-slate-200 px-3 py-1 text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={summaryByProjectTheme.finalTotal.expense}
                      onChange={(event) => updatePlanningFinalTotal("expense", event.target.value)}
                      className="ml-auto block w-24 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm font-semibold"
                    />
                  </td>
                  <td className="border-t border-slate-200 px-3 py-1 text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={summaryByProjectTheme.finalTotal.total}
                      onChange={(event) => updatePlanningFinalTotal("total", event.target.value)}
                      className="ml-auto block w-24 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm font-semibold"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </article>

          <article className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-max min-w-[1080px] border-separate border-spacing-0 border border-slate-200 text-left text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="w-72 px-3 py-2 font-semibold" rowSpan={2}>
                    Business Sponsor
                  </th>
                  <th className="px-3 py-2 text-center font-semibold" colSpan={3}>
                    Carry Forward to Current Fiscal
                  </th>
                  <th className="px-3 py-2 text-center font-semibold" colSpan={3}>
                    Current Fiscal Net New
                  </th>
                  <th className="px-3 py-2 text-center font-semibold" colSpan={3}>
                    Current Fiscal Proposed Plan
                  </th>
                </tr>
                <tr className="text-xs uppercase tracking-[0.04em] text-slate-600">
                  <th className="w-24 px-3 py-2 text-right font-semibold">Capex</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Expense</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Total</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Capex</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Expense</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Total</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Capex</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Expense</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {summaryByBusinessSponsor.rows.map((row, index) => (
                  <tr key={`summary-sponsor-${row.label}`} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                    <td className="border-t border-slate-100 px-3 py-2">{row.label}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.carryForwardCapex)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.carryForwardExpense)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.carryForwardTotal)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.netNewCapex)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.netNewExpense)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.netNewTotal)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.proposedCapex)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.proposedExpense)}</td>
                    <td className="border-t border-slate-100 px-3 py-2 text-right">{formatFinancialValue(row.proposedTotal)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-semibold">
                  <td className="border-t border-slate-200 px-3 py-2">Totals</td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByBusinessSponsor.totals.carryForwardCapex)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByBusinessSponsor.totals.carryForwardExpense)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByBusinessSponsor.totals.carryForwardTotal)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByBusinessSponsor.totals.netNewCapex)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByBusinessSponsor.totals.netNewExpense)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByBusinessSponsor.totals.netNewTotal)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByBusinessSponsor.totals.proposedCapex)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByBusinessSponsor.totals.proposedExpense)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right">
                    {formatFinancialValue(summaryByBusinessSponsor.totals.proposedTotal)}
                  </td>
                </tr>
                <tr>
                  <td className="border-t border-slate-200 px-3 py-2 font-semibold text-slate-700">
                    Current Fiscal Funding Availability
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right" colSpan={6} />
                  <td className="border-t border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                    {formatVarianceValue(summaryByBusinessSponsor.portfolioEffect.capex)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                    {formatVarianceValue(summaryByBusinessSponsor.portfolioEffect.expense)}
                  </td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                    {formatVarianceValue(summaryByBusinessSponsor.portfolioEffect.total)}
                  </td>
                </tr>
                <tr className="bg-slate-50 font-semibold">
                  <td className="border-t border-slate-200 px-3 py-2">Final Total</td>
                  <td className="border-t border-slate-200 px-3 py-2 text-right" colSpan={6} />
                  <td className="border-t border-slate-200 px-3 py-1 text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={summaryByBusinessSponsor.finalTotal.capex}
                      onChange={(event) => updatePlanningFinalTotal("capex", event.target.value)}
                      className="ml-auto block w-24 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm font-semibold"
                    />
                  </td>
                  <td className="border-t border-slate-200 px-3 py-1 text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={summaryByBusinessSponsor.finalTotal.expense}
                      onChange={(event) => updatePlanningFinalTotal("expense", event.target.value)}
                      className="ml-auto block w-24 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm font-semibold"
                    />
                  </td>
                  <td className="border-t border-slate-200 px-3 py-1 text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={summaryByBusinessSponsor.finalTotal.total}
                      onChange={(event) => updatePlanningFinalTotal("total", event.target.value)}
                      className="ml-auto block w-24 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm font-semibold"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </article>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Saved Versions</h3>
            <p className="mt-1 text-sm text-slate-600">View prior saved table snapshots with timestamps.</p>
          </div>
          <select
            value={selectedVersionId}
            onChange={(event) => setSelectedVersionId(event.target.value)}
            className="min-w-[260px] rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {versions.length === 0 ? <option value="">No versions available</option> : null}
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.id} · {formatDateTime(version.savedAt)} · {version.savedByName}
              </option>
            ))}
          </select>
        </div>

        {selectedVersion ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Saved on {formatDateTime(selectedVersion.savedAt)} by {selectedVersion.savedByName} ({selectedVersion.savedByEmail})
            </div>
            <div className="flex items-center justify-end px-1">
              <div className="flex w-[120px] justify-start">
                <button
                  type="button"
                  onClick={() => setVersionFiltersOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs font-semibold text-brand-700 transition ${
                    versionFiltersOpen ? "opacity-100" : "opacity-90 hover:opacity-100"
                  }`}
                  title={versionFiltersOpen ? "Hide filters" : "Show filters"}
                  aria-label={versionFiltersOpen ? "Hide filters" : "Show filters"}
                >
                  <IconFilter />
                  <span>Filter</span>
                </button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-xs">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 font-semibold">
                      <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onVersionSort("projectId")}>
                        Project ID <IconSortArrows direction={versionSortKey === "projectId" ? versionSortDirection : null} />
                      </button>
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onVersionSort("projectName")}>
                        Project Name <IconSortArrows direction={versionSortKey === "projectName" ? versionSortDirection : null} />
                      </button>
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onVersionSort("decision")}>
                        Decision <IconSortArrows direction={versionSortKey === "decision" ? versionSortDirection : null} />
                      </button>
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onVersionSort("comment")}>
                        Comment <IconSortArrows direction={versionSortKey === "comment" ? versionSortDirection : null} />
                      </button>
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      <button type="button" className="flex items-center gap-1.5 font-semibold" onClick={() => onVersionSort("updatedAt")}>
                        Updated <IconSortArrows direction={versionSortKey === "updatedAt" ? versionSortDirection : null} />
                      </button>
                    </th>
                  </tr>
                  {versionFiltersOpen ? (
                    <tr className="border-t border-slate-200 bg-slate-100/60">
                      <th className="px-3 py-2">
                        <input
                          value={versionFilters.projectId}
                          onChange={(event) => setVersionFilters((prev) => ({ ...prev, projectId: event.target.value }))}
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                          placeholder="Filter ID"
                        />
                      </th>
                      <th className="px-3 py-2">
                        <input
                          value={versionFilters.projectName}
                          onChange={(event) => setVersionFilters((prev) => ({ ...prev, projectName: event.target.value }))}
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                          placeholder="Filter project"
                        />
                      </th>
                      <th className="px-3 py-2">
                        <select
                          value={versionFilters.decision}
                          onChange={(event) => setVersionFilters((prev) => ({ ...prev, decision: event.target.value }))}
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-500"
                        >
                          <option value="">All decisions</option>
                          {SPO_COMMITTEE_DECISIONS.map((decision) => (
                            <option key={decision} value={decision}>
                              {decision}
                            </option>
                          ))}
                        </select>
                      </th>
                      <th className="px-3 py-2">
                        <input
                          value={versionFilters.comment}
                          onChange={(event) => setVersionFilters((prev) => ({ ...prev, comment: event.target.value }))}
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-500 placeholder:text-slate-500"
                          placeholder="Filter comment"
                        />
                      </th>
                      <th className="px-3 py-2 text-left">
                        <button
                          type="button"
                          onClick={() =>
                            setVersionFilters({
                              projectId: "",
                              projectName: "",
                              decision: "",
                              comment: ""
                            })
                          }
                          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                        >
                          Clear
                        </button>
                      </th>
                    </tr>
                  ) : null}
                </thead>
                <tbody>
                  {sortedVersionRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-left text-slate-500">
                        No records match the current filters.
                      </td>
                    </tr>
                  ) : (
                    sortedVersionRows.map((row, index) => (
                    <tr key={`${selectedVersion.id}-${row.projectId}`} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                      <td className="border-t border-slate-100 px-3 py-2 font-semibold text-brand-700">
                        <button
                          type="button"
                          onClick={() => {
                            void openPreview(row.projectId);
                          }}
                          className="text-left underline decoration-brand-300 underline-offset-2 hover:text-brand-600"
                          title="Open read-only project preview"
                        >
                          {row.projectId}
                        </button>
                      </td>
                      <td className="border-t border-slate-100 px-3 py-2">{row.projectName}</td>
                      <td className="border-t border-slate-100 px-3 py-2">{row.decision || "-"}</td>
                      <td className="border-t border-slate-100 px-3 py-2">{row.comment || "-"}</td>
                      <td className="border-t border-slate-100 px-3 py-2 text-slate-500">{formatDateTime(row.updatedAt)}</td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No saved versions yet.</p>
        )}
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
                    Read-only proposal preview. This view includes Overview, Sponsor & Timeline, Characteristics, and Financials.
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
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Submitter Name</p>
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
                          <h5 className="mb-2 text-sm font-semibold text-slate-900">
                            Total Investment (US &#39;000s)
                          </h5>
                          <table className="w-full table-fixed border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-100 text-slate-700">
                                <th className="w-[36%] border border-slate-200 px-2 py-1 text-left">Line Item</th>
                                <th className="border border-slate-200 px-2 py-1 text-center">Prior Yrs</th>
                                <th className="border border-slate-200 px-2 py-1 text-center">
                                  F{financialGridPreview.commencementFiscalYear}
                                </th>
                                <th className="border border-slate-200 px-2 py-1 text-center">Future</th>
                                <th className="border border-slate-200 px-2 py-1 text-center">Life</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="bg-slate-100 font-semibold text-slate-900">
                                <td className="border border-slate-200 px-2 py-1">Capital</td>
                                <td className="border border-slate-200 px-2 py-1 text-center">
                                  {formatFinancialValue(capitalTotalsPreview.priorYears)}
                                </td>
                                <td className="border border-slate-200 px-2 py-1 text-center">
                                  {formatFinancialValue(capitalTotalsPreview.currentFiscal)}
                                </td>
                                <td className="border border-slate-200 px-2 py-1 text-center">
                                  {formatFinancialValue(capitalTotalsPreview.future)}
                                </td>
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
                                    <td className="border border-slate-200 px-2 py-1 text-center">
                                      {formatFinancialValue(rowValues.priorYears)}
                                    </td>
                                    <td className="border border-slate-200 px-2 py-1 text-center">
                                      {formatFinancialValue(rowValues.currentFiscal)}
                                    </td>
                                    <td className="border border-slate-200 px-2 py-1 text-center">
                                      {formatFinancialValue(rowValues.future)}
                                    </td>
                                    <td className="border border-slate-200 px-2 py-1 text-center">
                                      {formatFinancialValue(rowLife)}
                                    </td>
                                  </tr>
                                );
                              })}
                              <tr className="bg-slate-100 font-semibold text-slate-900">
                                <td className="border border-slate-200 px-2 py-1">Total Investment</td>
                                <td className="border border-slate-200 px-2 py-1 text-center">
                                  {formatFinancialValue(totalInvestmentTotalsPreview.priorYears)}
                                </td>
                                <td className="border border-slate-200 px-2 py-1 text-center">
                                  {formatFinancialValue(totalInvestmentTotalsPreview.currentFiscal)}
                                </td>
                                <td className="border border-slate-200 px-2 py-1 text-center">
                                  {formatFinancialValue(totalInvestmentTotalsPreview.future)}
                                </td>
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
                          <h5 className="mb-2 text-sm font-semibold text-slate-900">
                            Incremental Revenue &amp; Cost (US &#39;000s)
                          </h5>
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
                                  <td key={`prev-revenue-${index}`} className="border border-slate-200 px-2 py-1 text-center">
                                    {formatFinancialValue(value)}
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td className="border border-slate-200 px-2 py-1 text-slate-700">Saved Costs</td>
                                {financialGridPreview.incremental.savedCosts.map((value, index) => (
                                  <td key={`prev-saved-${index}`} className="border border-slate-200 px-2 py-1 text-center">
                                    {formatFinancialValue(value)}
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td className="border border-slate-200 px-2 py-1 text-slate-700">
                                  Additional Operating Costs
                                </td>
                                {financialGridPreview.incremental.addlOperatingCosts.map((value, index) => (
                                  <td key={`prev-ops-${index}`} className="border border-slate-200 px-2 py-1 text-center">
                                    {formatFinancialValue(value)}
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td className="border border-slate-200 px-2 py-1 text-slate-700">
                                  Depreciation of Capital
                                </td>
                                {depreciationPreview.map((value, index) => (
                                  <td key={`prev-dep-${index}`} className="border border-slate-200 px-2 py-1 text-center">
                                    {formatFinancialValue(value)}
                                  </td>
                                ))}
                              </tr>
                              <tr className="bg-slate-100 font-semibold text-slate-900">
                                <td className="border border-slate-200 px-2 py-1">Net Benefits</td>
                                {netBenefitsPreview.map((value, index) => (
                                  <td key={`prev-net-${index}`} className="border border-slate-200 px-2 py-1 text-center">
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
