"use client";

import { useEffect, useState } from "react";

import type { ReportingAggregation, ReportingDataClassification, ReportingDatasetDefinition } from "@/lib/reporting/types";

type DatasetsPayload = {
  datasets: ReportingDatasetDefinition[];
  fiscalCalendars: Array<{ id: string; name: string; fiscalYearStartMonth: number; description: string }>;
  glossary: Array<{ term: string; definition: string }>;
};

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100";

const defaultForm = {
  datasetId: "",
  datasetName: "",
  description: "",
  owner: "Enterprise Data Office",
  refreshSchedule: "Daily",
  primaryKeys: "project_id",
  dimensions: "project_id:Project ID:string\nstage:Stage:string\nstatus:Status:string",
  measures: "project_count:Project Count:number\ntotal_cost:Total Cost:number",
  allowedAggregations: "sum,avg,count",
  dataClassification: "INTERNAL" as ReportingDataClassification,
  sampleQueries: "Portfolio by stage\nSLA aging by status"
};

const parseFields = (value: string, role: "DIMENSION" | "MEASURE") =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [keyRaw, labelRaw, typeRaw] = line.split(":");
      const key = (keyRaw ?? "").trim();
      const label = (labelRaw ?? key).trim();
      const type = (typeRaw ?? "string").trim();

      return {
        key,
        label,
        role,
        type: type === "number" || type === "date" || type === "boolean" ? type : "string",
        allowedAggregations: role === "MEASURE" ? ["sum", "avg", "min", "max", "count", "distinct_count"] : undefined
      };
    })
    .filter((field) => field.key.length > 0);

export default function DatasetGovernance() {
  const [payload, setPayload] = useState<DatasetsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/reporting/datasets");
      const json = (await response.json()) as { data?: DatasetsPayload; message?: string };
      if (!response.ok || !json.data) {
        throw new Error(json.message ?? "Unable to load datasets.");
      }
      setPayload(json.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load datasets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const saveDataset = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const dimensions = parseFields(form.dimensions, "DIMENSION");
      const measures = parseFields(form.measures, "MEASURE");

      const response = await fetch("/api/reporting/admin/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetId: form.datasetId.trim(),
          datasetName: form.datasetName.trim(),
          description: form.description.trim(),
          owner: form.owner.trim(),
          refreshSchedule: form.refreshSchedule.trim(),
          primaryKeys: form.primaryKeys.split(",").map((item) => item.trim()).filter(Boolean),
          dimensions,
          measures,
          allowedAggregations: form.allowedAggregations
            .split(",")
            .map((item) => item.trim())
            .filter((item): item is ReportingAggregation => ["sum", "avg", "min", "max", "count", "distinct_count"].includes(item)),
          dataClassification: form.dataClassification,
          permissions: [
            {
              roleTypes: [
                "BASIC_USER",
                "FINANCE_GOVERNANCE_USER",
                "PROJECT_GOVERNANCE_USER",
                "SPO_COMMITTEE_HUB_USER",
                "PROJECT_MANAGEMENT_HUB_ADMIN",
                "PROJECT_MANAGEMENT_HUB_BASIC_USER",
                "ADMIN"
              ],
              level: "BUILD"
            }
          ],
          sampleQueries: form.sampleQueries
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean)
        })
      });

      const json = (await response.json()) as { message?: string; data?: ReportingDatasetDefinition };
      if (!response.ok) {
        throw new Error(json.message ?? "Unable to save dataset.");
      }

      setMessage(`Dataset saved: ${json.data?.datasetName ?? "updated"}.`);
      setForm(defaultForm);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save dataset.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Reports Studio Admin</p>
        <h2 className="mt-1 text-3xl font-semibold text-slate-900">Dataset Governance</h2>
        <p className="mt-2 text-sm text-slate-600">
          Register approved datasets, glossary terms, and fiscal calendar controls for Reports Studio.
        </p>
      </section>

      {loading ? <p className="text-sm text-slate-500">Loading dataset governance...</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Register Dataset</h3>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Dataset ID
            <input className={inputClass} value={form.datasetId} onChange={(event) => setForm((prev) => ({ ...prev, datasetId: event.target.value }))} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Dataset Name
            <input className={inputClass} value={form.datasetName} onChange={(event) => setForm((prev) => ({ ...prev, datasetName: event.target.value }))} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 md:col-span-2">
            Description
            <textarea className={`${inputClass} h-16`} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Owner
            <input className={inputClass} value={form.owner} onChange={(event) => setForm((prev) => ({ ...prev, owner: event.target.value }))} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Refresh Schedule
            <input className={inputClass} value={form.refreshSchedule} onChange={(event) => setForm((prev) => ({ ...prev, refreshSchedule: event.target.value }))} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Primary Keys
            <input className={inputClass} value={form.primaryKeys} onChange={(event) => setForm((prev) => ({ ...prev, primaryKeys: event.target.value }))} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Allowed Aggregations
            <input className={inputClass} value={form.allowedAggregations} onChange={(event) => setForm((prev) => ({ ...prev, allowedAggregations: event.target.value }))} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Data Classification
            <select className={inputClass} value={form.dataClassification} onChange={(event) => setForm((prev) => ({ ...prev, dataClassification: event.target.value as ReportingDataClassification }))}>
              <option value="PUBLIC">Public</option>
              <option value="INTERNAL">Internal</option>
              <option value="CONFIDENTIAL">Confidential</option>
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 md:col-span-2">
            Dimensions (key:label:type per line)
            <textarea className={`${inputClass} h-24`} value={form.dimensions} onChange={(event) => setForm((prev) => ({ ...prev, dimensions: event.target.value }))} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 md:col-span-2">
            Measures (key:label:type per line)
            <textarea className={`${inputClass} h-24`} value={form.measures} onChange={(event) => setForm((prev) => ({ ...prev, measures: event.target.value }))} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 md:col-span-2">
            Sample Queries (one per line)
            <textarea className={`${inputClass} h-20`} value={form.sampleQueries} onChange={(event) => setForm((prev) => ({ ...prev, sampleQueries: event.target.value }))} />
          </label>
        </div>

        <button type="button" onClick={() => { void saveDataset(); }} disabled={saving} className="mt-4 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          {saving ? "Saving..." : "Save Dataset"}
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-brand-700 text-white">
              <tr>
                <th className="px-3 py-2">Dataset</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Classification</th>
                <th className="px-3 py-2">Refresh</th>
                <th className="px-3 py-2">Dimensions</th>
                <th className="px-3 py-2">Measures</th>
              </tr>
            </thead>
            <tbody>
              {(payload?.datasets ?? []).map((dataset, index) => (
                <tr key={dataset.datasetId} className={`border-t border-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-slate-900">{dataset.datasetName}</p>
                    <p className="text-xs text-slate-600">{dataset.datasetId}</p>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{dataset.owner}</td>
                  <td className="px-3 py-2 text-slate-700">{dataset.dataClassification}</td>
                  <td className="px-3 py-2 text-slate-700">{dataset.refreshSchedule}</td>
                  <td className="px-3 py-2 text-slate-700">{dataset.dimensions.length}</td>
                  <td className="px-3 py-2 text-slate-700">{dataset.measures.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
