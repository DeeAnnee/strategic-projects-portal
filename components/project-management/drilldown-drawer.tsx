"use client";

import type { PmDrilldownResponse } from "@/lib/pm-dashboard/types";

type Props = {
  open: boolean;
  loading?: boolean;
  data: PmDrilldownResponse | null;
  onClose: () => void;
};

const formatNumber = (value: number) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

const formatMoney = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

export default function DrilldownDrawer({ open, loading = false, data, onClose }: Props) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <aside className="h-full w-full max-w-3xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Project Drilldown</h3>
              <p className="text-sm text-slate-600">
                {data?.project.projectId ?? "--"} · {data?.project.title ?? "Loading"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {loading ? (
            <div className="space-y-2">
              <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
              <div className="h-24 animate-pulse rounded bg-slate-100" />
              <div className="h-24 animate-pulse rounded bg-slate-100" />
            </div>
          ) : !data ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Project details are unavailable.
            </p>
          ) : (
            <>
              <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Status</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {data.project.status} · {data.project.health}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Stage</p>
                  <p className="text-sm font-semibold text-slate-900">{data.project.stage}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Planned Timeline</p>
                  <p className="text-sm text-slate-700">
                    {data.project.startDate} to {data.project.endDate}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Forecast Timeline</p>
                  <p className="text-sm text-slate-700">
                    {data.project.forecastStartDate} to {data.project.forecastEndDate}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Project Manager</p>
                  <p className="text-sm text-slate-700">{data.project.projectManager}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Sponsors</p>
                  <p className="text-sm text-slate-700">
                    {data.project.businessSponsor} · {data.project.financeSponsor}
                  </p>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-900">SLA Timers</h4>
                <div className="mt-3 grid gap-2 md:grid-cols-5">
                  {[
                    { label: "Sponsor", value: data.sla.sponsorDays },
                    { label: "PGO", value: data.sla.pgoDays },
                    { label: "FGO", value: data.sla.fgoDays },
                    { label: "SPO", value: data.sla.spoDays },
                    { label: "Cycle", value: data.sla.cycleDays }
                  ].map((item) => (
                    <div key={item.label} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">{item.label}</p>
                      <p className="text-sm font-semibold text-slate-900">{formatNumber(item.value)}d</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-900">Timeline and Milestones</h4>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-2 py-1 text-left">Milestone</th>
                        <th className="px-2 py-1 text-left">Planned</th>
                        <th className="px-2 py-1 text-left">Forecast</th>
                        <th className="px-2 py-1 text-left">Actual</th>
                        <th className="px-2 py-1 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.milestones.map((row) => (
                        <tr key={row.id} className="border-t border-slate-100">
                          <td className="px-2 py-1">{row.name}</td>
                          <td className="px-2 py-1">{row.plannedDate}</td>
                          <td className="px-2 py-1">{row.forecastDate}</td>
                          <td className="px-2 py-1">{row.actualDate ?? "-"}</td>
                          <td className="px-2 py-1">{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-slate-900">Tasks</h4>
                  <div className="mt-3 space-y-2">
                    {data.tasks.slice(0, 12).map((task) => (
                      <div key={task.id} className="rounded-md border border-slate-200 px-3 py-2">
                        <p className="text-sm font-medium text-slate-800">{task.name}</p>
                        <p className="text-xs text-slate-500">
                          {task.status} · Due {task.dueDate} · {task.ownerName}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-slate-900">Risks and Issues</h4>
                  <div className="mt-3 space-y-2">
                    {data.risks.slice(0, 6).map((risk) => (
                      <div key={risk.id} className="rounded-md border border-slate-200 px-3 py-2">
                        <p className="text-sm font-medium text-slate-800">
                          Risk · {risk.severity} · {risk.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {risk.impactArea} · {risk.status} · {risk.ownerName}
                        </p>
                      </div>
                    ))}
                    {data.issues.slice(0, 4).map((issue) => (
                      <div key={issue.id} className="rounded-md border border-slate-200 px-3 py-2">
                        <p className="text-sm font-medium text-slate-800">
                          Issue · {issue.severity} · {issue.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {issue.status} · Opened {issue.openedAt}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-900">Approval History and Audit Trail</h4>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Approvals</p>
                    <div className="mt-2 space-y-1">
                      {data.approvals.map((entry, index) => (
                        <p key={`${entry.stage}-${index}`} className="text-xs text-slate-700">
                          {entry.stage}: {entry.status} {entry.decidedAt ? `(${entry.decidedAt})` : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Audit Trail</p>
                    <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                      {data.auditTrail.map((entry, index) => (
                        <p key={`${entry.createdAt}-${index}`} className="text-xs text-slate-700">
                          {entry.createdAt} · {entry.action} · {entry.note}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-900">Change Log</h4>
                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Latest Status</p>
                    <p className="text-sm font-semibold text-slate-900">{data.changeLog.latestChangeStatus}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Risk Indicator</p>
                    <p className="text-sm font-semibold text-slate-900">{data.changeLog.changeRiskIndicator}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Cumulative Budget Delta</p>
                    <p className={`text-sm font-semibold ${data.changeLog.cumulativeBudgetDelta >= 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {formatMoney(data.changeLog.cumulativeBudgetDelta)}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Avg Approval Time</p>
                    <p className="text-sm font-semibold text-slate-900">{formatNumber(data.changeLog.averageApprovalTimeHours)}h</p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Change Timeline</p>
                    <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                      {data.changeLog.timeline.length === 0 ? (
                        <p className="text-xs text-slate-500">No change requests recorded for this project.</p>
                      ) : (
                        data.changeLog.timeline.map((entry) => (
                          <div key={entry.changeRequestId} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-xs font-semibold text-brand-700">{entry.changeRequestId}</p>
                            <p className="text-xs font-medium text-slate-800">{entry.title}</p>
                            <p className="text-[11px] text-slate-600">{entry.status} · {entry.changeType.replaceAll("_", " ")}</p>
                            <p className="text-[11px] text-slate-500">{entry.impactSummary}</p>
                            <p className="text-[11px] text-slate-500">Submitted {entry.submittedAt}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Before vs After Diffs</p>
                    <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                      {data.changeLog.changes.length === 0 ? (
                        <p className="text-xs text-slate-500">No field deltas captured.</p>
                      ) : (
                        data.changeLog.changes.flatMap((change) =>
                          change.fieldDeltas.map((delta) => (
                            <div key={delta.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                              <p className="text-[11px] font-semibold text-slate-700">{change.changeRequest.id} · {delta.fieldName}</p>
                              <div className="mt-1 grid gap-1 md:grid-cols-2">
                                <p className="text-[11px] text-slate-500">Before: {String(delta.oldValue ?? "-")}</p>
                                <p className="text-[11px] text-brand-700">After: {String(delta.newValue ?? "-")}</p>
                              </div>
                            </div>
                          ))
                        )
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-900">Financials and Benefits Snapshot</h4>
                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Budget Approved</p>
                    <p className="text-sm font-semibold text-slate-900">{formatMoney(data.financials.budgetApproved)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Spend To Date</p>
                    <p className="text-sm font-semibold text-slate-900">{formatMoney(data.financials.spendToDate)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Forecast To Complete</p>
                    <p className="text-sm font-semibold text-slate-900">{formatMoney(data.financials.forecastToComplete)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">ROI Proxy</p>
                    <p className="text-sm font-semibold text-slate-900">{formatNumber(data.financials.roiProxy)}x</p>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
