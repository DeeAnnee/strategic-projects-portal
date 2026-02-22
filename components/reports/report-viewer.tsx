"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ReportFilterDefinition,
  ReportParameterDefinition,
  ReportRunResult,
  SavedReport,
  SavedTemplate
} from "@/lib/reporting/types";

type Props = {
  id: string;
  kind?: "report" | "template";
};

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100";

const downloadViaApi = async (
  endpoint: "/api/reporting/exports/excel" | "/api/reporting/exports/pptx" | "/api/reporting/exports/raw",
  payload: Record<string, unknown>
) => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(json.message ?? "Export failed.");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename=\"([^\"]+)\"/i);
  const filename = filenameMatch?.[1] ?? `report-export-${Date.now()}`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const normalizeFilterValue = (value: string) => value.trim();

export default function ReportViewer({ id, kind = "report" }: Props) {
  const [meta, setMeta] = useState<SavedReport | SavedTemplate | null>(null);
  const [run, setRun] = useState<ReportRunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Array<{ field: string; value: string }>>([]);

  const runEndpoint = kind === "template" ? `/api/reporting/templates/${encodeURIComponent(id)}/run` : `/api/reporting/reports/${encodeURIComponent(id)}/run`;
  const metaEndpoint = kind === "template" ? `/api/reporting/templates/${encodeURIComponent(id)}` : `/api/reporting/reports/${encodeURIComponent(id)}`;

  const loadMeta = useCallback(async () => {
    const response = await fetch(metaEndpoint);
    const payload = (await response.json()) as { data?: SavedReport | SavedTemplate; message?: string };
    if (!response.ok || !payload.data) {
      throw new Error(payload.message ?? "Unable to load report.");
    }
    return payload.data;
  }, [metaEndpoint]);

  const runReport = useCallback(async (nextParameters: Record<string, string>, nextFilters: ReportFilterDefinition[] = []) => {
    const response = await fetch(runEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parameters: nextParameters, filters: nextFilters })
    });
    const payload = (await response.json()) as { data?: ReportRunResult; message?: string };
    if (!response.ok || !payload.data) {
      throw new Error(payload.message ?? "Unable to run report.");
    }
    return payload.data;
  }, [runEndpoint]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const metaData = await loadMeta();
        if (!active) return;
        setMeta(metaData);

        const initialParams = (metaData.definition.parameters ?? []).reduce<Record<string, string>>((acc, parameter) => {
          acc[parameter.id] = parameter.defaultValue ?? "";
          return acc;
        }, {});
        setParameters(initialParams);

        const runData = await runReport(initialParams);
        if (!active) return;
        setRun(runData);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load report viewer.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [id, kind, loadMeta, runReport]);

  const parameterDefinitions: ReportParameterDefinition[] = useMemo(() => meta?.definition.parameters ?? [], [meta?.definition.parameters]);

  const appliedFilterPayload = useMemo<ReportFilterDefinition[]>(
    () =>
      filters
        .filter((item) => item.field.trim() && item.value.trim())
        .map((item) => ({ field: item.field, operator: "eq", value: normalizeFilterValue(item.value) })),
    [filters]
  );

  const rerun = async () => {
    setLoading(true);
    setError(null);
    try {
      const runData = await runReport(parameters, appliedFilterPayload);
      setRun(runData);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to run report.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Reports Studio</p>
            <h2 className="mt-1 text-3xl font-semibold text-slate-900">{meta?.title ?? "Report Viewer"}</h2>
            <p className="mt-2 text-sm text-slate-600">{meta?.description ?? "Read-only report rendering with parameterized execution."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void downloadViaApi("/api/reporting/exports/excel", {
                  [kind === "template" ? "templateId" : "reportId"]: id,
                  runInput: { parameters, filters: appliedFilterPayload }
                });
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export Excel
            </button>
            <button
              type="button"
              onClick={() => {
                void downloadViaApi("/api/reporting/exports/pptx", {
                  [kind === "template" ? "templateId" : "reportId"]: id,
                  runInput: { parameters, filters: appliedFilterPayload }
                });
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export PowerPoint
            </button>
            <button
              type="button"
              onClick={() => {
                void downloadViaApi("/api/reporting/exports/raw", {
                  [kind === "template" ? "templateId" : "reportId"]: id,
                  runInput: { parameters, filters: appliedFilterPayload },
                  mode: "raw"
                });
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Download Raw Data
            </button>
            <button
              type="button"
              onClick={() => {
                void rerun();
              }}
              className="rounded-md bg-brand-700 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {parameterDefinitions.map((parameter) => (
            <label key={parameter.id} className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              {parameter.label}
              <input
                className={inputClass}
                value={parameters[parameter.id] ?? ""}
                onChange={(event) =>
                  setParameters((prev) => ({
                    ...prev,
                    [parameter.id]: event.target.value
                  }))
                }
                placeholder={parameter.defaultValue || "Enter value"}
              />
            </label>
          ))}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Quick Filter Field
            <input
              className={inputClass}
              value={filters[0]?.field ?? ""}
              onChange={(event) =>
                setFilters((prev) => {
                  const existing = prev[0] ?? { field: "", value: "" };
                  return [{ ...existing, field: event.target.value }];
                })
              }
              placeholder="e.g. stage"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Quick Filter Value
            <input
              className={inputClass}
              value={filters[0]?.value ?? ""}
              onChange={(event) =>
                setFilters((prev) => {
                  const existing = prev[0] ?? { field: "", value: "" };
                  return [{ ...existing, value: event.target.value }];
                })
              }
              placeholder="e.g. Funding Request"
            />
          </label>
        </div>
      </section>

      {loading ? <p className="text-sm text-slate-500">Running report...</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {!loading && !error && run ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-brand-700 text-white">
                  <tr>
                    {run.table.columns.map((column) => (
                      <th key={column} className="px-3 py-2 font-semibold">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {run.table.rows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-slate-500" colSpan={run.table.columns.length || 1}>
                        No records match current parameters and filters.
                      </td>
                    </tr>
                  ) : (
                    run.table.rows.map((row, index) => (
                      <tr key={`row-${index}`} className={`border-t border-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                        {run.table.columns.map((column) => (
                          <td key={`${index}-${column}`} className="px-3 py-2 text-slate-700">
                            {String(row[column] ?? "-")}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
              Showing page {run.table.page} with {run.table.rows.length} rows of {run.table.totalRows}.
            </div>

            <div className="border-t border-slate-200 p-3">
              <h4 className="text-sm font-semibold text-slate-900">Charts</h4>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {run.charts.map((chart) => (
                  <article key={chart.visualId} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-900">{chart.title}</p>
                    <p className="text-xs text-slate-500">{chart.type.toUpperCase()} • {chart.data.length} points</p>
                    <div className="mt-2 max-h-36 overflow-auto rounded border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-600">
                      {chart.data.slice(0, 5).map((point, idx) => (
                        <p key={`${chart.visualId}-p-${idx}`}>
                          {Object.entries(point)
                            .map(([key, value]) => `${key}: ${String(value ?? "")}`)
                            .join(" | ")}
                        </p>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Insights</h3>
            <p className="mt-1 text-sm text-slate-600">Deterministic trend, anomaly, and driver analysis.</p>

            <p className="mt-3 rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-900">
              {run.insights.executiveSummary}
            </p>

            <ul className="mt-3 space-y-2">
              {run.insights.bullets.map((insight, index) => (
                <li key={`${insight.type}-${index}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{insight.type}</p>
                  <p className="font-semibold text-slate-800">{insight.title}</p>
                  <p>{insight.detail}</p>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
