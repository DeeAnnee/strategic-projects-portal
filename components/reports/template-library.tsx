"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { SavedTemplate } from "@/lib/reporting/types";

type TemplateScope = "all" | "my" | "team" | "global";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100";

const normalizeEmail = (value?: string) => (value ?? "").trim().toLowerCase();

export default function TemplateLibrary() {
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [scope, setScope] = useState<TemplateScope>("all");
  const [query, setQuery] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadTemplates = async (search = "") => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/reporting/templates?${params.toString()}`);
      const payload = (await response.json()) as { data?: SavedTemplate[]; message?: string };

      if (!response.ok || !payload.data) {
        throw new Error(payload.message ?? "Unable to load templates.");
      }

      setTemplates(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load templates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadTemplates(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const loadUser = async () => {
      const response = await fetch("/api/me");
      if (!response.ok) return;
      const payload = (await response.json()) as { email?: string };
      setCurrentUserEmail(normalizeEmail(payload.email));
    };

    void loadUser();
  }, []);

  const filteredTemplates = useMemo(() => {
    if (scope === "all") return templates;

    if (scope === "global") {
      return templates.filter((item) => item.isFeatured);
    }

    if (scope === "my") {
      return templates.filter((item) => normalizeEmail(item.access.ownerEmail) === currentUserEmail);
    }

    return templates.filter((item) => normalizeEmail(item.access.ownerEmail) !== currentUserEmail);
  }, [currentUserEmail, scope, templates]);

  const cloneTemplate = async (templateId: string) => {
    setActionMessage(null);
    const response = await fetch(`/api/reporting/templates/${encodeURIComponent(templateId)}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const payload = (await response.json()) as { message?: string; data?: SavedTemplate };
    if (!response.ok) {
      setError(payload.message ?? "Unable to clone template.");
      return;
    }
    setActionMessage(`Template cloned: ${payload.data?.title ?? "Copy created"}.`);
    await loadTemplates(query);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Reports Studio</p>
            <h2 className="mt-1 text-3xl font-semibold text-slate-900">Template Library</h2>
            <p className="mt-2 text-sm text-slate-600">
              Reusable report templates with sharing, cloning, and version history.
            </p>
          </div>
          <Link href="/reports/builder" className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            Create Template in Builder
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 xl:col-span-2">
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={inputClass}
              placeholder="Search templates"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Scope
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as TemplateScope)}
              className={inputClass}
            >
              <option value="all">All Templates</option>
              <option value="my">My Templates</option>
              <option value="team">Team Templates</option>
              <option value="global">Global Templates</option>
            </select>
          </label>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Showing {filteredTemplates.length} templates
          </div>
        </div>
      </section>

      {loading ? <p className="text-sm text-slate-500">Loading template library...</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {actionMessage ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{actionMessage}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-brand-700 text-white">
              <tr>
                <th className="px-3 py-2">Template</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Tags</th>
                <th className="px-3 py-2">Versions</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={6}>
                    No templates found for this scope.
                  </td>
                </tr>
              ) : (
                filteredTemplates.map((template, index) => (
                  <tr key={template.id} className={`border-t border-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                    <td className="px-3 py-3 align-top">
                      <p className="font-semibold text-slate-900">{template.title}</p>
                      <p className="text-xs text-slate-600">{template.description}</p>
                      {template.isFeatured ? (
                        <span className="mt-1 inline-flex rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                          Global Template
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{template.access.ownerEmail}</td>
                    <td className="px-3 py-3 text-slate-700">{template.tags.join(", ") || "-"}</td>
                    <td className="px-3 py-3 text-slate-700">{template.versions.length}</td>
                    <td className="px-3 py-3 text-slate-700">{new Date(template.updatedAt).toLocaleString()}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/reports/builder?templateId=${encodeURIComponent(template.id)}`}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Use
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            void cloneTemplate(template.id);
                          }}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Clone
                        </button>
                        <Link
                          href={`/reports/view/${encodeURIComponent(template.id)}?kind=template`}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
