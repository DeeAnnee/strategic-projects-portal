"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type SentToMeItem = {
  requestId: string;
  changeRequestId?: string;
  projectId: string;
  projectName: string;
  stage: "BUSINESS" | "TECHNOLOGY" | "FINANCE" | "BENEFITS" | "PROJECT_MANAGER" | "CHANGE";
  entityType: "PROPOSAL" | "FUNDING_REQUEST" | "PM_ASSIGNMENT" | "CHANGE_REQUEST";
  status: "PENDING" | "APPROVED" | "REJECTED" | "NEED_MORE_INFO" | "CANCELLED";
  actingAs: "SPONSOR" | "DELEGATE" | null;
  requestedAt: string;
  decidedAt?: string;
  dueDate?: string;
  ownerName?: string;
  ownerEmail?: string;
  sponsorComment?: string | null;
};

type SentByMeItem = {
  requestId: string;
  projectId: string;
  projectName: string;
  entityType: "PROPOSAL" | "FUNDING_REQUEST" | "PM_ASSIGNMENT";
  roleContext: string;
  stage: "BUSINESS" | "TECHNOLOGY" | "FINANCE" | "BENEFITS" | "PROJECT_MANAGER";
  status: "PENDING" | "APPROVED" | "REJECTED" | "NEED_MORE_INFO" | "CANCELLED";
  requestedAt: string;
  decidedAt?: string;
  comment?: string | null;
  approverName: string;
  approverEmail: string;
};

type QueuePayload = {
  sentToMe: SentToMeItem[];
  sentByMe: SentByMeItem[];
};

const approvalStepLabel = (stage: SentToMeItem["stage"] | SentByMeItem["stage"]) => {
  if (stage === "BUSINESS") return "Business Sponsor";
  if (stage === "TECHNOLOGY") return "Technology Sponsor";
  if (stage === "FINANCE") return "Finance Sponsor";
  if (stage === "BENEFITS") return "Benefits Sponsor";
  if (stage === "PROJECT_MANAGER") return "Project Manager Assignment";
  return "Change Request";
};

const stageContextLabel = (entityType: SentToMeItem["entityType"] | SentByMeItem["entityType"]) => {
  if (entityType === "PROPOSAL") return "Proposal";
  if (entityType === "FUNDING_REQUEST") return "Funding";
  if (entityType === "PM_ASSIGNMENT") return "PM Assignment";
  return "Change Request";
};

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
};

const statusBadgeClass = (status: string) => {
  const normalized = status.toUpperCase();
  if (normalized === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "REJECTED") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalized === "NEED_MORE_INFO") return "border-amber-200 bg-amber-50 text-amber-700";
  if (normalized === "CANCELLED") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-brand-200 bg-brand-50 text-brand-700";
};

const tabClass = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-semibold ${
    active ? "bg-brand-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
  }`;

export default function MyApprovals() {
  const [queue, setQueue] = useState<QueuePayload>({ sentToMe: [], sentByMe: [] });
  const [activeTab, setActiveTab] = useState<"sent-to-me" | "sent-by-me">("sent-to-me");
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [commentByRequest, setCommentByRequest] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/approvals/my-queue");
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.message ?? "Failed to load approvals queue.");
      return;
    }
    setQueue(payload.data ?? { sentToMe: [], sentByMe: [] });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sentToMe = useMemo(() => queue.sentToMe ?? [], [queue.sentToMe]);
  const sentByMe = useMemo(() => queue.sentByMe ?? [], [queue.sentByMe]);

  const submitDecision = async (
    row: SentToMeItem,
    action: "approve" | "reject" | "need-more-info"
  ) => {
    setBusyRequestId(row.requestId);
    setError(null);

    try {
      const isChangeRequest = row.entityType === "CHANGE_REQUEST";
      const commentValue = commentByRequest[row.requestId]?.trim() || "";

      if ((action === "reject" || action === "need-more-info") && commentValue.length === 0) {
        throw new Error("Comment is required for Reject and Need More Info.");
      }

      const endpoint = isChangeRequest
        ? `/api/change-requests/${encodeURIComponent(row.changeRequestId ?? "")}/${action === "need-more-info" ? "reject" : action}`
        : `/api/projects/${row.projectId}/${action}`;

      const body = isChangeRequest
        ? { comment: commentValue || undefined }
        : {
            requestId: row.requestId,
            stage: row.stage === "CHANGE" ? undefined : row.stage,
            comment: commentValue || undefined
          };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? `Failed to ${action} approval.`);
      }

      setCommentByRequest((prev) => ({ ...prev, [row.requestId]: "" }));
      await load();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Failed to save decision.");
    } finally {
      setBusyRequestId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Approvals</h2>
        <p className="mt-1 text-sm text-slate-600">
          All governance and sponsor decisions are actioned only in this section.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("sent-to-me")}
            className={tabClass(activeTab === "sent-to-me")}
          >
            Sent To Me
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("sent-by-me")}
            className={tabClass(activeTab === "sent-by-me")}
          >
            Sent By Me
          </button>
        </div>
      </section>

      {activeTab === "sent-to-me" ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 font-semibold">Project</th>
                <th className="px-3 py-2 font-semibold">Approval Step</th>
                <th className="px-3 py-2 font-semibold">Requested</th>
                <th className="px-3 py-2 font-semibold">Owner</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Comment</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sentToMe.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-left text-slate-500">
                    No approval requests currently assigned to you.
                  </td>
                </tr>
              ) : (
                sentToMe.map((row) => (
                  <tr key={row.requestId} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-800">{row.projectName}</p>
                      <p className="text-xs text-slate-500">{row.projectId}</p>
                      <p className="text-[11px] uppercase tracking-[0.06em] text-slate-400">
                        {stageContextLabel(row.entityType)}
                      </p>
                      <Link
                        href={`/submissions/${encodeURIComponent(row.projectId)}/edit?mode=view`}
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        View project
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs font-medium text-slate-700">{approvalStepLabel(row.stage)}</td>
                    <td className="px-3 py-2">{formatDateTime(row.requestedAt)}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.ownerName || "-"}
                      {row.ownerEmail ? ` (${row.ownerEmail})` : ""}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}>
                        {row.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        className="w-full rounded-md border border-slate-300 px-2 py-1"
                        value={commentByRequest[row.requestId] ?? ""}
                        onChange={(event) =>
                          setCommentByRequest((prev) => ({ ...prev, [row.requestId]: event.target.value }))
                        }
                        placeholder={row.sponsorComment ? `Prior: ${row.sponsorComment}` : "Comment"}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void submitDecision(row, "approve");
                          }}
                          disabled={busyRequestId === row.requestId}
                          className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void submitDecision(row, "reject");
                          }}
                          disabled={busyRequestId === row.requestId}
                          className="rounded-md bg-red-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Reject
                        </button>
                        {row.entityType !== "CHANGE_REQUEST" ? (
                          <button
                            type="button"
                            onClick={() => {
                              void submitDecision(row, "need-more-info");
                            }}
                            disabled={busyRequestId === row.requestId}
                            className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Need More Info
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 font-semibold">Project</th>
                <th className="px-3 py-2 font-semibold">Approver</th>
                <th className="px-3 py-2 font-semibold">Approval Step</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Requested</th>
                <th className="px-3 py-2 font-semibold">Decided</th>
                <th className="px-3 py-2 font-semibold">Comment</th>
              </tr>
            </thead>
            <tbody>
              {sentByMe.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-left text-slate-500">
                    No approval requests initiated by you yet.
                  </td>
                </tr>
              ) : (
                sentByMe.map((row) => (
                  <tr key={row.requestId} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-800">{row.projectName}</p>
                      <p className="text-xs text-slate-500">{row.projectId}</p>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.approverName}
                      <span className="text-slate-500"> ({row.approverEmail})</span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <p className="font-medium text-slate-700">{approvalStepLabel(row.stage)}</p>
                      <p className="text-[11px] uppercase tracking-[0.06em] text-slate-400">
                        {stageContextLabel(row.entityType)}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}>
                        {row.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2">{formatDateTime(row.requestedAt)}</td>
                    <td className="px-3 py-2">{formatDateTime(row.decidedAt)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{row.comment || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
