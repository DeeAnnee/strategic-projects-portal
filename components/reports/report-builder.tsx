"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ReportCalculationDefinition,
  ReportDefinition,
  ReportRunResult,
  ReportValueDefinition,
  ReportingDatasetDefinition,
  ReportingFieldDefinition,
  SavedReport,
  SavedTemplate
} from "@/lib/reporting/types";

type Props = {
  reportId?: string;
  templateId?: string;
};

type DatasetPayload = {
  datasets: ReportingDatasetDefinition[];
  fiscalCalendars: Array<{ id: string; name: string; fiscalYearStartMonth: number; description: string }>;
  glossary: Array<{ term: string; definition: string }>;
};

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100";

const mkBaseDefinition = (): ReportDefinition => ({
  name: "New Self-Service Report",
  description: "",
  datasetIds: [],
  fiscalCalendarId: "org_default",
  views: [
    {
      id: "view-main",
      name: "Main View",
      rows: [],
      columns: [],
      values: [],
      filters: [],
      sort: [],
      pageSize: 25,
      showTotals: true,
      pivotMode: true,
      visuals: [
        {
          id: "visual-table",
          title: "Table View",
          type: "table"
        }
      ]
    }
  ],
  calculations: [],
  parameters: [],
  formatting: {
    currency: "USD",
    decimals: 2
  }
});

const uniquePush = (items: string[], value: string) => {
  if (!value.trim()) return items;
  if (items.includes(value)) return items;
  return [...items, value];
};

const parseEmails = (value: string) =>
  Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );

const valueFormatForFieldType = (field?: ReportingFieldDefinition): ReportValueDefinition["format"] => {
  if (!field) return "number";
  if (field.key.includes("cost") || field.key.includes("budget") || field.key.includes("capex") || field.key.includes("expense") || field.key.includes("npv") || field.key.includes("benefit")) {
    return "currency";
  }
  if (field.key.includes("pct") || field.key.includes("percent") || field.key.includes("ratio")) {
    return "percent";
  }
  return "number";
};

export default function ReportBuilder({ reportId, templateId }: Props) {
  const [datasetPayload, setDatasetPayload] = useState<DatasetPayload | null>(null);
  const [definition, setDefinition] = useState<ReportDefinition>(mkBaseDefinition);
  const [title, setTitle] = useState("New Self-Service Report");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  const [selectedField, setSelectedField] = useState("");
  const [selectedValueField, setSelectedValueField] = useState("");
  const [selectedValueAggregation, setSelectedValueAggregation] = useState<ReportValueDefinition["aggregation"]>("sum");
  const [selectedFilterField, setSelectedFilterField] = useState("");
  const [selectedFilterValue, setSelectedFilterValue] = useState("");
  const [shareViewers, setShareViewers] = useState("");
  const [shareEditors, setShareEditors] = useState("");

  const [preview, setPreview] = useState<ReportRunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningPreview, setRunningPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savedReportId, setSavedReportId] = useState<string | null>(reportId ?? null);

  const activeView = definition.views[0];

  const selectedDatasets = useMemo(() => {
    const all = datasetPayload?.datasets ?? [];
    const idSet = new Set(definition.datasetIds);
    return all.filter((dataset) => idSet.has(dataset.datasetId));
  }, [datasetPayload?.datasets, definition.datasetIds]);

  const dimensionFields = useMemo(
    () => selectedDatasets.flatMap((dataset) => dataset.dimensions.map((field) => ({ ...field, datasetId: dataset.datasetId }))),
    [selectedDatasets]
  );

  const measureFields = useMemo(
    () => selectedDatasets.flatMap((dataset) => dataset.measures.map((field) => ({ ...field, datasetId: dataset.datasetId }))),
    [selectedDatasets]
  );

  const allFieldOptions = useMemo(
    () => [...dimensionFields, ...measureFields],
    [dimensionFields, measureFields]
  );

  const loadBuilderContext = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [datasetResponse, reportResponse] = await Promise.all([
        fetch("/api/reporting/datasets"),
        reportId
          ? fetch(`/api/reporting/reports/${encodeURIComponent(reportId)}`)
          : templateId
            ? fetch(`/api/reporting/templates/${encodeURIComponent(templateId)}`)
            : Promise.resolve(null)
      ]);

      const datasetJson = (await datasetResponse.json()) as { data?: DatasetPayload; message?: string };
      if (!datasetResponse.ok || !datasetJson.data) {
        throw new Error(datasetJson.message ?? "Unable to load datasets.");
      }
      setDatasetPayload(datasetJson.data);

      if (reportResponse) {
        const reportJson = (await reportResponse.json()) as {
          data?: SavedReport | SavedTemplate;
          message?: string;
        };

        if (!reportResponse.ok || !reportJson.data) {
          throw new Error(reportJson.message ?? "Unable to load report/template.");
        }

        setTitle(reportJson.data.title);
        setDescription(reportJson.data.description);
        setTags(reportJson.data.tags.join(", "));
        setDefinition(reportJson.data.definition);
        if (reportId) {
          setSavedReportId(reportJson.data.id);
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load builder context.");
    } finally {
      setLoading(false);
    }
  }, [reportId, templateId]);

  useEffect(() => {
    void loadBuilderContext();
  }, [loadBuilderContext]);

  const toggleDataset = (datasetId: string) => {
    setDefinition((prev) => {
      const selected = new Set(prev.datasetIds);
      if (selected.has(datasetId)) {
        selected.delete(datasetId);
      } else {
        selected.add(datasetId);
      }

      return {
        ...prev,
        datasetIds: Array.from(selected)
      };
    });
  };

  const addRowField = () => {
    if (!selectedField) return;
    setDefinition((prev) => ({
      ...prev,
      views: [
        {
          ...prev.views[0],
          rows: uniquePush(prev.views[0]?.rows ?? [], selectedField)
        }
      ]
    }));
  };

  const addColumnField = () => {
    if (!selectedField) return;
    setDefinition((prev) => ({
      ...prev,
      views: [
        {
          ...prev.views[0],
          columns: uniquePush(prev.views[0]?.columns ?? [], selectedField)
        }
      ]
    }));
  };

  const addValueField = () => {
    if (!selectedValueField) return;

    const matchedField = measureFields.find((field) => field.key === selectedValueField);
    const label = matchedField?.label ?? selectedValueField;

    setDefinition((prev) => {
      const existingValues = prev.views[0]?.values ?? [];
      if (existingValues.some((item) => item.field === selectedValueField && item.aggregation === selectedValueAggregation)) {
        return prev;
      }

      return {
        ...prev,
        views: [
          {
            ...prev.views[0],
            values: [
              ...existingValues,
              {
                field: selectedValueField,
                label,
                aggregation: selectedValueAggregation,
                format: valueFormatForFieldType(matchedField)
              }
            ]
          }
        ]
      };
    });
  };

  const addFilter = () => {
    if (!selectedFilterField || !selectedFilterValue.trim()) return;

    setDefinition((prev) => ({
      ...prev,
      views: [
        {
          ...prev.views[0],
          filters: [
            ...(prev.views[0]?.filters ?? []),
            {
              field: selectedFilterField,
              operator: "eq",
              value: selectedFilterValue.trim()
            }
          ]
        }
      ]
    }));
    setSelectedFilterValue("");
  };

  const removeListItem = (
    type: "rows" | "columns" | "values" | "filters",
    index: number
  ) => {
    setDefinition((prev) => {
      const view = prev.views[0];
      if (!view) return prev;

      if (type === "rows") {
        return {
          ...prev,
          views: [
            {
              ...view,
              rows: view.rows.filter((_, rowIndex) => rowIndex !== index)
            }
          ]
        };
      }

      if (type === "columns") {
        return {
          ...prev,
          views: [
            {
              ...view,
              columns: view.columns.filter((_, colIndex) => colIndex !== index)
            }
          ]
        };
      }

      if (type === "values") {
        return {
          ...prev,
          views: [
            {
              ...view,
              values: view.values.filter((_, valueIndex) => valueIndex !== index)
            }
          ]
        };
      }

      return {
        ...prev,
        views: [
          {
            ...view,
            filters: view.filters.filter((_, filterIndex) => filterIndex !== index)
          }
        ]
      };
    });
  };

  const addCalculation = () => {
    const nextId = `calc-${Date.now()}`;
    const newCalculation: ReportCalculationDefinition = {
      id: nextId,
      name: "Variance %",
      type: "VARIANCE_PCT",
      outputField: `variance_pct_${definition.calculations.length + 1}`,
      config: {
        minuendField: activeView?.values[0]?.label ?? "",
        subtrahendField: activeView?.values[1]?.label ?? activeView?.values[0]?.label ?? ""
      }
    };

    setDefinition((prev) => ({
      ...prev,
      calculations: [...prev.calculations, newCalculation]
    }));
  };

  const addParameter = () => {
    const fallbackField = activeView?.rows[0] || activeView?.columns[0] || "fiscal_year";
    const nextId = `${fallbackField}_${Date.now()}`;

    setDefinition((prev) => ({
      ...prev,
      parameters: [
        ...prev.parameters,
        {
          id: nextId,
          label: `Parameter: ${fallbackField}`,
          type: "string",
          required: false
        }
      ]
    }));
  };

  const runPreview = async () => {
    setRunningPreview(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/reporting/reports/run-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          definition,
          runInput: {
            viewId: activeView?.id,
            filters: activeView?.filters ?? []
          }
        })
      });

      const payload = (await response.json()) as { data?: ReportRunResult; message?: string };
      if (!response.ok || !payload.data) {
        throw new Error(payload.message ?? "Unable to run preview.");
      }

      setPreview(payload.data);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Unable to run preview.");
    } finally {
      setRunningPreview(false);
    }
  };

  const saveReport = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/reporting/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: savedReportId ?? undefined,
          title,
          description,
          tags: tags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          definition
        })
      });

      const payload = (await response.json()) as { data?: SavedReport; message?: string };
      if (!response.ok || !payload.data) {
        throw new Error(payload.message ?? "Unable to save report.");
      }

      setSavedReportId(payload.data.id);
      setMessage(`Report saved successfully (${payload.data.id}).`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save report.");
    } finally {
      setSaving(false);
    }
  };

  const saveAsTemplate = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/reporting/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${title} Template`,
          description,
          tags: tags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          definition
        })
      });

      const payload = (await response.json()) as { data?: SavedTemplate; message?: string };
      if (!response.ok || !payload.data) {
        throw new Error(payload.message ?? "Unable to save template.");
      }

      setMessage(`Template saved successfully (${payload.data.id}).`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save template.");
    } finally {
      setSaving(false);
    }
  };

  const shareReport = async () => {
    if (!savedReportId) {
      setError("Save the report before sharing.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/reporting/reports/${encodeURIComponent(savedReportId)}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewers: parseEmails(shareViewers),
          editors: parseEmails(shareEditors)
        })
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to share report.");
      }

      setMessage("Report sharing updated.");
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Unable to share report.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading Reports Studio Builder...</p>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Reports Studio</p>
            <h2 className="mt-1 text-3xl font-semibold text-slate-900">Report Builder</h2>
            <p className="mt-2 text-sm text-slate-600">
              Build table and chart reports with reusable templates, calculations, and server-side insights.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void runPreview();
              }}
              disabled={runningPreview}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {runningPreview ? "Running..." : "Run Preview"}
            </button>
            <button
              type="button"
              onClick={() => {
                void saveReport();
              }}
              disabled={saving}
              className="rounded-md bg-brand-700 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              Save Report
            </button>
            <button
              type="button"
              onClick={() => {
                void saveAsTemplate();
              }}
              disabled={saving}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Save as Template
            </button>
            <Link href="/reports/templates" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Library
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Report Title
            <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Tags (comma separated)
            <input className={inputClass} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="portfolio, governance" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 md:col-span-2">
            Description
            <textarea className={`${inputClass} h-20`} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Share viewers (emails)
            <input className={inputClass} value={shareViewers} onChange={(event) => setShareViewers(event.target.value)} placeholder="user1@portal.local, user2@portal.local" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Share editors (emails)
            <input className={inputClass} value={shareEditors} onChange={(event) => setShareEditors(event.target.value)} placeholder="editor@portal.local" />
          </label>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              void shareReport();
            }}
            disabled={saving || !savedReportId}
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Share Report
          </button>
        </div>
      </section>

      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[300px_1fr_320px]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Datasets & Fields</h3>
          <p className="mt-1 text-xs text-slate-600">Approved datasets only. Permissions enforced server-side.</p>

          <div className="mt-3 space-y-2">
            {(datasetPayload?.datasets ?? []).map((dataset) => (
              <label key={dataset.datasetId} className="flex items-start gap-2 rounded border border-slate-200 p-2 text-sm">
                <input
                  type="checkbox"
                  checked={definition.datasetIds.includes(dataset.datasetId)}
                  onChange={() => toggleDataset(dataset.datasetId)}
                />
                <span>
                  <span className="font-semibold text-slate-900">{dataset.datasetName}</span>
                  <span className="block text-xs text-slate-600">{dataset.description}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Dimensions</p>
            <div className="max-h-40 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
              {dimensionFields.map((field) => (
                <p key={`dim-${field.datasetId}-${field.key}`}>
                  <span className="font-semibold">{field.label}</span> <span className="text-slate-500">({field.key})</span>
                </p>
              ))}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Measures</p>
            <div className="max-h-40 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
              {measureFields.map((field) => (
                <p key={`measure-${field.datasetId}-${field.key}`}>
                  <span className="font-semibold">{field.label}</span> <span className="text-slate-500">({field.key})</span>
                </p>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Studio Canvas</h3>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 md:col-span-2">
              Select field
              <select
                className={inputClass}
                value={selectedField}
                onChange={(event) => setSelectedField(event.target.value)}
              >
                <option value="">Select field</option>
                {allFieldOptions.map((field) => (
                  <option key={`field-${field.datasetId}-${field.key}`} value={field.key}>
                    {field.label} ({field.datasetId})
                  </option>
                ))}
              </select>
            </label>

            <button type="button" onClick={addRowField} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Add to Rows
            </button>
            <button type="button" onClick={addColumnField} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Add to Columns
            </button>

            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Value field
              <select
                className={inputClass}
                value={selectedValueField}
                onChange={(event) => setSelectedValueField(event.target.value)}
              >
                <option value="">Select measure</option>
                {measureFields.map((field) => (
                  <option key={`value-field-${field.datasetId}-${field.key}`} value={field.key}>
                    {field.label} ({field.datasetId})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Aggregation
              <select
                className={inputClass}
                value={selectedValueAggregation}
                onChange={(event) => setSelectedValueAggregation(event.target.value as ReportValueDefinition["aggregation"])}
              >
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
                <option value="count">Count</option>
                <option value="distinct_count">Distinct Count</option>
              </select>
            </label>
            <button type="button" onClick={addValueField} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:col-span-2">
              Add Value
            </button>

            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Filter field
              <select
                className={inputClass}
                value={selectedFilterField}
                onChange={(event) => setSelectedFilterField(event.target.value)}
              >
                <option value="">Select field</option>
                {allFieldOptions.map((field) => (
                  <option key={`filter-field-${field.datasetId}-${field.key}`} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Filter value
              <input className={inputClass} value={selectedFilterValue} onChange={(event) => setSelectedFilterValue(event.target.value)} />
            </label>
            <button type="button" onClick={addFilter} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:col-span-2">
              Add Filter
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <article className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Rows</p>
              <div className="mt-2 space-y-1 text-sm">
                {activeView?.rows.length ? (
                  activeView.rows.map((item, index) => (
                    <div key={`row-${item}-${index}`} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1">
                      <span>{item}</span>
                      <button type="button" onClick={() => removeListItem("rows", index)} className="text-xs font-semibold text-red-600">Remove</button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">No row dimensions.</p>
                )}
              </div>
            </article>

            <article className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Columns</p>
              <div className="mt-2 space-y-1 text-sm">
                {activeView?.columns.length ? (
                  activeView.columns.map((item, index) => (
                    <div key={`col-${item}-${index}`} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1">
                      <span>{item}</span>
                      <button type="button" onClick={() => removeListItem("columns", index)} className="text-xs font-semibold text-red-600">Remove</button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">No column dimensions.</p>
                )}
              </div>
            </article>

            <article className="rounded-lg border border-slate-200 p-3 md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Values</p>
              <div className="mt-2 space-y-1 text-sm">
                {activeView?.values.length ? (
                  activeView.values.map((item, index) => (
                    <div key={`value-${item.field}-${index}`} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1">
                      <span>{item.label} ({item.aggregation})</span>
                      <button type="button" onClick={() => removeListItem("values", index)} className="text-xs font-semibold text-red-600">Remove</button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">No measures selected.</p>
                )}
              </div>
            </article>

            <article className="rounded-lg border border-slate-200 p-3 md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Filters</p>
              <div className="mt-2 space-y-1 text-sm">
                {activeView?.filters.length ? (
                  activeView.filters.map((item, index) => (
                    <div key={`filter-${item.field}-${index}`} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1">
                      <span>{item.field} {item.operator} {String(item.value)}</span>
                      <button type="button" onClick={() => removeListItem("filters", index)} className="text-xs font-semibold text-red-600">Remove</button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">No filters added.</p>
                )}
              </div>
            </article>
          </div>
        </section>

        <section className="space-y-3">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Calculations</h3>
            <p className="mt-1 text-xs text-slate-600">Supports arithmetic, variance %, time intelligence, and ranking.</p>
            <button
              type="button"
              onClick={addCalculation}
              className="mt-3 rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Add Calculation
            </button>
            <div className="mt-3 space-y-2">
              {definition.calculations.map((calculation, index) => (
                <div key={calculation.id} className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                  <p className="font-semibold">{calculation.name}</p>
                  <p>
                    {calculation.type} {"->"} {calculation.outputField}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setDefinition((prev) => ({
                        ...prev,
                        calculations: prev.calculations.filter((_, calcIndex) => calcIndex !== index)
                      }))
                    }
                    className="mt-1 text-xs font-semibold text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Parameters</h3>
            <p className="mt-1 text-xs text-slate-600">Reusable inputs for templates and viewer runs.</p>
            <button
              type="button"
              onClick={addParameter}
              className="mt-3 rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Add Parameter
            </button>
            <div className="mt-3 space-y-2">
              {definition.parameters.map((parameter, index) => (
                <div key={parameter.id} className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                  <p className="font-semibold">{parameter.label}</p>
                  <p>{parameter.type}</p>
                  <button
                    type="button"
                    onClick={() =>
                      setDefinition((prev) => ({
                        ...prev,
                        parameters: prev.parameters.filter((_, paramIndex) => paramIndex !== index)
                      }))
                    }
                    className="mt-1 text-xs font-semibold text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Glossary</h3>
            <div className="mt-2 space-y-2 text-xs text-slate-700">
              {(datasetPayload?.glossary ?? []).map((entry) => (
                <div key={entry.term}>
                  <p className="font-semibold text-slate-900">{entry.term}</p>
                  <p>{entry.definition}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Preview</h3>
        {!preview ? (
          <p className="mt-2 text-sm text-slate-500">Run preview to populate table, chart data, and insights.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-brand-700 text-white">
                  <tr>
                    {preview.table.columns.map((column) => (
                      <th key={column} className="px-3 py-2">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.table.rows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-slate-500" colSpan={preview.table.columns.length || 1}>
                        No records match current layout and filters.
                      </td>
                    </tr>
                  ) : (
                    preview.table.rows.map((row, rowIndex) => (
                      <tr key={`preview-row-${rowIndex}`} className="border-t border-slate-100">
                        {preview.table.columns.map((column) => (
                          <td key={`preview-cell-${rowIndex}-${column}`} className="px-3 py-2 text-slate-700">
                            {String(row[column] ?? "-")}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {preview.charts.map((chart) => (
                <article key={chart.visualId} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-semibold text-slate-900">{chart.title}</p>
                  <p className="text-xs text-slate-500">{chart.type} • {chart.data.length} points</p>
                  <div className="mt-2 max-h-28 overflow-auto rounded border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-600">
                    {chart.data.slice(0, 4).map((point, index) => (
                      <p key={`${chart.visualId}-${index}`}>
                        {Object.entries(point)
                          .map(([key, value]) => `${key}: ${String(value ?? "")}`)
                          .join(" | ")}
                      </p>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <article className="rounded-lg border border-brand-100 bg-brand-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">Insights</p>
              <p className="mt-1 text-sm text-brand-900">{preview.insights.executiveSummary}</p>
              <ul className="mt-2 space-y-1 text-xs text-brand-900">
                {preview.insights.bullets.map((insight, index) => (
                  <li key={`${insight.type}-${index}`}>• {insight.title}: {insight.detail}</li>
                ))}
              </ul>
            </article>
          </div>
        )}
      </section>
    </div>
  );
}
