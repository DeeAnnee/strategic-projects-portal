"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { ReportingDatasetDefinition, SavedReport, SavedTemplate } from "@/lib/reporting/types";

type HomePayload = {
  datasets: ReportingDatasetDefinition[];
  recentReports: SavedReport[];
  sharedWithMe: SavedReport[];
  featuredTemplates: SavedTemplate[];
  insightFeed: Array<{
    reportId: string;
    reportTitle: string;
    summary: string;
    generatedAt: string;
  }>;
};

const sectionCardClass = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";

export default function ReportsHome() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<HomePayload | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (debouncedQuery.trim()) {
          params.set("search", debouncedQuery.trim());
        }

        const response = await fetch(`/api/reporting/home?${params.toString()}`);
        const json = (await response.json()) as { data?: HomePayload; message?: string };
        if (!response.ok || !json.data) {
          throw new Error(json.message ?? "Unable to load reports home.");
        }

        if (active) {
          setPayload(json.data);
        }
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load reports home.");
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
  }, [debouncedQuery]);

  const datasetCount = useMemo(() => payload?.datasets.length ?? 0, [payload?.datasets.length]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Reports Studio</p>
            <h2 className="mt-1 text-3xl font-semibold text-slate-900">Self-Service Reports</h2>
            <p className="mt-2 text-sm text-slate-600">
              Build table reports with reusable templates, analytics, and insights.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/reports/builder"
              className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Create New Report
            </Link>
            <Link
              href="/reports/templates"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Template Library
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Approved datasets</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{datasetCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Recent reports</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{payload?.recentReports.length ?? 0}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Featured templates</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{payload?.featuredTemplates.length ?? 0}</p>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Search reports, templates, datasets</label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="Search by name, tag, or description"
          />
        </div>
      </section>

      {loading ? <p className="text-sm text-slate-500">Loading Reports Studio...</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {!loading && !error && payload ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className={sectionCardClass}>
            <h3 className="text-lg font-semibold text-slate-900">Recent Reports</h3>
            <div className="mt-3 space-y-2">
              {payload.recentReports.length === 0 ? (
                <p className="text-sm text-slate-500">No reports match your search.</p>
              ) : (
                payload.recentReports.map((report) => (
                  <article key={report.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{report.title}</p>
                        <p className="text-xs text-slate-600">{report.description}</p>
                      </div>
                      <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        v{report.versions.length}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link href={`/reports/view/${report.id}`} className="text-xs font-semibold text-brand-700 hover:text-brand-600">
                        Open Viewer
                      </Link>
                      <Link href={`/reports/builder?reportId=${encodeURIComponent(report.id)}`} className="text-xs font-semibold text-brand-700 hover:text-brand-600">
                        Open Builder
                      </Link>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className={sectionCardClass}>
            <h3 className="text-lg font-semibold text-slate-900">Shared With Me</h3>
            <div className="mt-3 space-y-2">
              {payload.sharedWithMe.length === 0 ? (
                <p className="text-sm text-slate-500">No shared reports yet.</p>
              ) : (
                payload.sharedWithMe.map((report) => (
                  <article key={report.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="font-semibold text-slate-900">{report.title}</p>
                    <p className="text-xs text-slate-600">Owner: {report.access.ownerEmail}</p>
                    <div className="mt-2">
                      <Link href={`/reports/view/${report.id}`} className="text-xs font-semibold text-brand-700 hover:text-brand-600">
                        View Report
                      </Link>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className={sectionCardClass}>
            <h3 className="text-lg font-semibold text-slate-900">Featured Templates</h3>
            <div className="mt-3 space-y-2">
              {payload.featuredTemplates.length === 0 ? (
                <p className="text-sm text-slate-500">No featured templates configured.</p>
              ) : (
                payload.featuredTemplates.map((template) => (
                  <article key={template.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="font-semibold text-slate-900">{template.title}</p>
                    <p className="text-xs text-slate-600">{template.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link href={`/reports/builder?templateId=${encodeURIComponent(template.id)}`} className="text-xs font-semibold text-brand-700 hover:text-brand-600">
                        Use Template
                      </Link>
                      <Link href="/reports/templates" className="text-xs font-semibold text-brand-700 hover:text-brand-600">
                        Open Library
                      </Link>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className={sectionCardClass}>
            <h3 className="text-lg font-semibold text-slate-900">Insights Feed</h3>
            <div className="mt-3 space-y-2">
              {payload.insightFeed.length === 0 ? (
                <p className="text-sm text-slate-500">No insights generated yet.</p>
              ) : (
                payload.insightFeed.map((insight) => (
                  <article key={insight.reportId} className="rounded-lg border border-slate-200 p-3">
                    <p className="font-semibold text-slate-900">{insight.reportTitle}</p>
                    <p className="mt-1 text-sm text-slate-700">{insight.summary}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Updated {new Date(insight.generatedAt).toLocaleString()}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
