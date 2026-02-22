"use client";

import { useState } from "react";

const stages = [
  {
    name: "Placemat Proposal",
    description: "Submitter prepares initiative scope, rationale, and baseline financial assumptions.",
    statuses: ["Draft", "Submitted", "Sent for Approval", "Returned to Submitter", "Rejected", "Deferred", "Cancelled"]
  },
  {
    name: "Request Funding",
    description: "Finance and governance validate assumptions and request budget authorization.",
    statuses: ["Draft", "Submitted", "Sent for Approval", "Approved", "Returned to Submitter", "Rejected", "Deferred"]
  },
  {
    name: "Change Request (if required)",
    description: "Post-approval scope/budget changes are captured and re-approved if material.",
    statuses: ["Draft", "Submitted", "Sent for Approval", "Approved", "Returned to Submitter", "Rejected", "Deferred", "Cancelled"]
  }
] as const;

type WorkflowStage = (typeof stages)[number];

const jobAids = [
  { name: "Placemat Authoring Guide", type: "PDF", audience: "Submitters" },
  { name: "Funding Request Checklist", type: "XLSX", audience: "Finance" },
  { name: "Governance Gate Standards", type: "DOCX", audience: "Project Governance" }
] as const;

const trainingMaterial = [
  { title: "Stage-Gate Fundamentals", duration: "18 min", level: "Beginner" },
  { title: "Sponsor Approval & Decisioning", duration: "22 min", level: "Intermediate" },
  { title: "Change Request Best Practices", duration: "20 min", level: "Advanced" }
] as const;

export default function ResourcesPageClient() {
  const [selected, setSelected] = useState<WorkflowStage>(stages[0]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] accent-text">Enablement Hub</p>
        <h2 className="mt-2 text-3xl font-semibold">Resources & Training</h2>
        <p className="mt-2 text-sm text-slate-600">Central library for job aids, stage/status guidance, and training content.</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold">Interactive Stage & Status Flow</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-2">
            {stages.map((stage) => (
              <button
                key={stage.name}
                type="button"
                onClick={() => setSelected(stage)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selected.name === stage.name ? "accent-bg" : "border-slate-300 bg-slate-50 hover:bg-slate-100"}`}
              >
                {stage.name}
              </button>
            ))}
          </div>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-base font-semibold">{selected.name}</h4>
            <p className="mt-1 text-sm text-slate-600">{selected.description}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Allowed statuses</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {selected.statuses.map((status) => (
                <span key={status} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs">
                  {status}
                </span>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Job Aids</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {jobAids.map((item) => (
              <li key={item.name} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="font-medium">{item.name}</p>
                <p className="text-slate-600">{item.type} · {item.audience}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Training Material</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {trainingMaterial.map((item) => (
              <li key={item.title} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="font-medium">{item.title}</p>
                <p className="text-slate-600">{item.duration} · {item.level}</p>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold">Training Video</h3>
        <p className="mt-1 text-sm text-slate-600">Strategic Projects Portal workflow walkthrough.</p>
        <div className="mt-4 mx-auto w-full max-w-[1200px] aspect-video overflow-hidden rounded-xl border border-slate-200 bg-black">
          <iframe
            title="Strategic Projects Portal Training"
            src="https://www.youtube.com/embed/xqo9tQXIuWE"
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </section>
    </div>
  );
}
