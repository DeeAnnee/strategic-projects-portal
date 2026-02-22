"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  ChangePriority,
  ChangeRequestStatus,
  ChangeType
} from "@/lib/change-management/types";
import type { PmChangeDashboardWidgets } from "@/lib/pm-dashboard/types";
import type { ProjectSubmission } from "@/lib/submissions/types";

type ChangeRequestApiRow = {
  changeRequest: {
    id: string;
    projectId: string;
    changeType: ChangeType;
    title: string;
    description: string;
    justification: string;
    status: ChangeRequestStatus;
    impactScope: string;
    impactScheduleDays: number;
    impactBudgetDelta: number;
    impactBenefitsDelta: number;
    impactRiskLevel: "Low" | "Medium" | "High" | "Critical";
    priority: ChangePriority;
    requiresCommitteeReview: boolean;
    decisionSummary?: string;
    requestedByName?: string;
    requestedByEmail?: string;
    createdAt: string;
    approvedByName?: string;
    approvedAt?: string;
    implementedAt?: string;
    changeSeverity: "Minor" | "Moderate" | "Major" | "Critical";
    changeSeverityScore: number;
    projectedCompletionDate?: string;
  };
  deltas: Array<{
    id: string;
    fieldName: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  approvals: Array<{
    id: string;
    roleContext: string;
    status: string;
    approverName: string;
    approverEmail: string;
    requestedAt: string;
    decidedAt?: string;
    comment?: string;
  }>;
  comments: Array<{
    id: string;
    comment: string;
    authorName: string;
    authorEmail?: string;
    createdAt: string;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType?: string;
    uploadedByName?: string;
    uploadedAt: string;
  }>;
  project?: {
    id: string;
    title: string;
    stage: string;
    status: string;
    isEligible: boolean;
  };
};

type ApiResponse<T> = {
  data?: T;
  message?: string;
  meta?: {
    templates?: Array<{ id: string; name: string; description: string; changeType: ChangeType }>;
    thresholds?: {
      budgetImpactThresholdAbs: number;
      budgetImpactThresholdPct: number;
      scheduleImpactThresholdDays: number;
      cumulativeBudgetEscalationPct: number;
    };
  };
};

type Props = {
  widgets: PmChangeDashboardWidgets;
  onOpenDrilldown: (projectId: string) => void;
};

const changeTypeOptions: Array<{ value: ChangeType; label: string }> = [
  { value: "SCOPE_CHANGE", label: "Scope Change" },
  { value: "SCHEDULE_CHANGE", label: "Schedule Change" },
  { value: "BUDGET_CHANGE", label: "Budget Change" },
  { value: "BENEFITS_CHANGE", label: "Benefits Change" },
  { value: "RESOURCE_CHANGE", label: "Resource Change" },
  { value: "RISK_RECLASSIFICATION", label: "Risk Reclassification" },
  { value: "TECHNICAL_CHANGE", label: "Technical Change" },
  { value: "OTHER", label: "Other" }
];

const fieldOptions = [
  "title",
  "summary",
  "priority",
  "riskLevel",
  "segmentUnit",
  "projectTheme",
  "strategicObjective",
  "startDate",
  "endDate",
  "targetGoLive",
  "financials.capex",
  "financials.opex",
  "financials.oneTimeCosts",
  "benefits.costSaveEst",
  "benefits.revenueUpliftEst",
  "businessCase.scopeSchedule.goLive",
  "businessCase.scopeSchedule.benefitRealizationStart"
];

const statusOrder: ChangeRequestStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "IMPLEMENTED",
  "REJECTED",
  "CLOSED"
];

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

const formatMoney = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

const severityClass = (severity: string) => {
  if (severity === "Critical") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "Major") return "border-rose-200 bg-rose-50 text-rose-700";
  if (severity === "Moderate") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};

const statusClass = (status: ChangeRequestStatus) => {
  if (status === "REJECTED") return "border-red-200 bg-red-50 text-red-700";
  if (status === "APPROVED" || status === "IMPLEMENTED" || status === "CLOSED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "UNDER_REVIEW" || status === "SUBMITTED") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-300 bg-slate-100 text-slate-700";
};

const emptyFieldChange = () => ({
  fieldName: "endDate",
  newValue: ""
});

export default function ChangeManagementTab({ widgets, onOpenDrilldown }: Props) {
  const [projectRows, setProjectRows] = useState<ProjectSubmission[]>([]);
  const [rows, setRows] = useState<ChangeRequestApiRow[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; description: string; changeType: ChangeType }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decisionCommentById, setDecisionCommentById] = useState<Record<string, string>>({});
  const [discussionComment, setDiscussionComment] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");

  const [formState, setFormState] = useState({
    projectId: "",
    changeType: "SCHEDULE_CHANGE" as ChangeType,
    title: "",
    description: "",
    justification: "",
    impactScope: "",
    impactScheduleDays: "0",
    impactBudgetDelta: "0",
    impactBenefitsDelta: "0",
    impactRiskLevel: "Medium" as "Low" | "Medium" | "High" | "Critical",
    priority: "Medium" as ChangePriority,
    requiresCommitteeReview: false
  });
  const [fieldChanges, setFieldChanges] = useState<Array<{ fieldName: string; newValue: string }>>([emptyFieldChange()]);

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((row) => row.changeRequest.id === selectedId) ?? null : null),
    [rows, selectedId]
  );

  const eligibleProjects = useMemo(
    () =>
      projectRows.filter((row) => {
        const status = (row.status ?? "").trim().toUpperCase();
        const stage = (row.stage ?? "").trim().toUpperCase();
        const fundingStatus = (row.workflow?.fundingStatus ?? "").trim().toUpperCase();
        return status === "APPROVED" || stage === "DELIVERY" || stage === "LIVE PROJECT" || fundingStatus === "LIVE";
      }),
    [projectRows]
  );

  const boardColumns = useMemo(() => {
    const map = new Map<ChangeRequestStatus, ChangeRequestApiRow[]>();
    statusOrder.forEach((status) => map.set(status, []));
    rows.forEach((row) => {
      const list = map.get(row.changeRequest.status);
      if (list) list.push(row);
    });
    return map;
  }, [rows]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectsRes, changesRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/change-requests")
      ]);

      const projectsPayload = (await projectsRes.json()) as ApiResponse<ProjectSubmission[]>;
      const changesPayload = (await changesRes.json()) as ApiResponse<ChangeRequestApiRow[]>;

      if (!projectsRes.ok) {
        throw new Error(projectsPayload.message ?? "Unable to load projects.");
      }
      if (!changesRes.ok) {
        throw new Error(changesPayload.message ?? "Unable to load change requests.");
      }

      setProjectRows(Array.isArray(projectsPayload.data) ? projectsPayload.data : []);
      setRows(Array.isArray(changesPayload.data) ? changesPayload.data : []);
      setTemplates(changesPayload.meta?.templates ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load change management data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!formState.projectId && eligibleProjects.length > 0) {
      setFormState((prev) => ({ ...prev, projectId: eligibleProjects[0]?.id ?? "" }));
    }
  }, [eligibleProjects, formState.projectId]);

  const createDraft = async () => {
    if (!formState.projectId) {
      setError("Select a project to initiate a change request.");
      return;
    }

    setBusyId("create");
    setError(null);
    try {
      const response = await fetch("/api/change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formState,
          impactScheduleDays: Number(formState.impactScheduleDays),
          impactBudgetDelta: Number(formState.impactBudgetDelta),
          impactBenefitsDelta: Number(formState.impactBenefitsDelta),
          fieldChanges: fieldChanges.filter((row) => row.fieldName.trim().length > 0)
        })
      });
      const payload = (await response.json()) as ApiResponse<{ changeRequest: { id: string } }>;
      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to create draft.");
      }
      await load();
      if (payload.data?.changeRequest?.id) {
        setSelectedId(payload.data.changeRequest.id);
      }
      setFormState((prev) => ({
        ...prev,
        title: "",
        description: "",
        justification: "",
        impactScope: "",
        impactScheduleDays: "0",
        impactBudgetDelta: "0",
        impactBenefitsDelta: "0",
        requiresCommitteeReview: false
      }));
      setFieldChanges([emptyFieldChange()]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create draft.");
    } finally {
      setBusyId(null);
    }
  };

  const runAction = async (id: string, action: "submit" | "approve" | "reject" | "implement") => {
    setBusyId(`${action}-${id}`);
    setError(null);
    try {
      const endpoint =
        action === "submit"
          ? `/api/change-requests/${encodeURIComponent(id)}/submit`
          : action === "approve"
            ? `/api/change-requests/${encodeURIComponent(id)}/approve`
            : action === "reject"
              ? `/api/change-requests/${encodeURIComponent(id)}/reject`
              : `/api/change-requests/${encodeURIComponent(id)}/implement`;

      const payloadBody =
        action === "reject"
          ? { comment: decisionCommentById[id] || "Rejected" }
          : action === "approve"
            ? { comment: decisionCommentById[id] || undefined }
            : action === "implement"
              ? { closeAfterImplement: false }
              : {};

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody)
      });
      const payload = (await response.json()) as ApiResponse<unknown>;
      if (!response.ok) {
        throw new Error(payload.message ?? `Unable to ${action} change request.`);
      }
      await load();
      setDecisionCommentById((prev) => ({ ...prev, [id]: "" }));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Unable to ${action} change request.`);
    } finally {
      setBusyId(null);
    }
  };

  const addDiscussionComment = async () => {
    if (!selectedRow) return;
    if (!discussionComment.trim()) return;
    setBusyId(`comment-${selectedRow.changeRequest.id}`);
    try {
      const response = await fetch(`/api/change-requests/${encodeURIComponent(selectedRow.changeRequest.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_comment", comment: discussionComment.trim() })
      });
      const payload = (await response.json()) as ApiResponse<unknown>;
      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to add comment.");
      }
      setDiscussionComment("");
      await load();
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : "Unable to add comment.");
    } finally {
      setBusyId(null);
    }
  };

  const addAttachment = async () => {
    if (!selectedRow) return;
    if (!attachmentName.trim() || !attachmentUrl.trim()) return;
    setBusyId(`attachment-${selectedRow.changeRequest.id}`);
    try {
      const response = await fetch(`/api/change-requests/${encodeURIComponent(selectedRow.changeRequest.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_attachment",
          fileName: attachmentName.trim(),
          fileUrl: attachmentUrl.trim()
        })
      });
      const payload = (await response.json()) as ApiResponse<unknown>;
      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to add attachment.");
      }
      setAttachmentName("");
      setAttachmentUrl("");
      await load();
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : "Unable to add attachment.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Projects with Active Changes</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{widgets.projectsWithActiveChanges}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Budget Impact from Changes</p>
          <p className={`mt-1 text-2xl font-semibold ${widgets.totalBudgetImpact >= 0 ? "text-rose-700" : "text-emerald-700"}`}>
            {formatMoney(widgets.totalBudgetImpact)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Avg Change Approval Time</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{widgets.avgChangeApprovalTimeHours.toFixed(1)}h</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Change Board</h3>
            <p className="text-xs text-slate-500">Kanban view of active and historical change requests.</p>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {statusOrder.map((status) => (
              <div key={status} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">{status.replaceAll("_", " ")}</p>
                <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                  {(boardColumns.get(status) ?? []).map((row) => (
                    <button
                      key={row.changeRequest.id}
                      type="button"
                      onClick={() => setSelectedId(row.changeRequest.id)}
                      className="w-full rounded-md border border-slate-200 bg-white p-2 text-left hover:border-brand-200"
                    >
                      <p className="text-xs font-semibold text-brand-700">{row.changeRequest.id}</p>
                      <p className="text-xs font-medium text-slate-800">{row.changeRequest.title}</p>
                      <p className="text-[11px] text-slate-500">{row.changeRequest.projectId}</p>
                    </button>
                  ))}
                  {(boardColumns.get(status) ?? []).length === 0 ? (
                    <p className="text-[11px] text-slate-400">No items</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Change Requests by Status</h3>
          <div className="mt-3 space-y-2">
            {widgets.changeRequestsByStatus.length === 0 ? (
              <p className="text-xs text-slate-500">No change requests captured yet.</p>
            ) : (
              widgets.changeRequestsByStatus.map((row) => (
                <div key={row.status} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  <span className="font-medium text-slate-700">{row.status}</span>
                  <span className="font-semibold text-slate-900">{row.count}</span>
                </div>
              ))
            )}
          </div>

          <h4 className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Risk Flags ({">"} 3 changes)</h4>
          <div className="mt-2 space-y-2">
            {widgets.projectsWithMoreThan3Changes.length === 0 ? (
              <p className="text-xs text-slate-500">No project currently exceeds the risk threshold.</p>
            ) : (
              widgets.projectsWithMoreThan3Changes.map((item) => (
                <button
                  key={`risk-flag-${item.projectId}`}
                  type="button"
                  onClick={() => onOpenDrilldown(item.projectId)}
                  className="w-full rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-left text-xs text-rose-700 hover:bg-rose-100"
                >
                  {item.projectId} · {item.changes} changes
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Initiate Change Request</h3>
        <p className="mt-1 text-xs text-slate-500">
          Approved/Delivery projects are locked. Submit controlled changes here to update baseline fields.
        </p>

        {templates.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() =>
                  setFormState((prev) => ({
                    ...prev,
                    changeType: template.changeType,
                    title: template.name,
                    impactScope: template.description
                  }))
                }
                className="rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
              >
                {template.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">
            Project
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={formState.projectId}
              onChange={(event) => setFormState((prev) => ({ ...prev, projectId: event.target.value }))}
            >
              {eligibleProjects.length === 0 ? <option value="">No eligible projects</option> : null}
              {eligibleProjects.map((project) => (
                <option key={`eligible-${project.id}`} value={project.id}>
                  {project.id} · {project.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Change Type
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={formState.changeType}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, changeType: event.target.value as ChangeType }))
              }
            >
              {changeTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Title
            <input
              value={formState.title}
              onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Priority
            <select
              value={formState.priority}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, priority: event.target.value as ChangePriority }))
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700 lg:col-span-2">
            Description
            <textarea
              value={formState.description}
              onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
              className="mt-1 min-h-[72px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700 lg:col-span-2">
            Justification
            <textarea
              value={formState.justification}
              onChange={(event) => setFormState((prev) => ({ ...prev, justification: event.target.value }))}
              className="mt-1 min-h-[72px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700 lg:col-span-2">
            Impact Scope
            <textarea
              value={formState.impactScope}
              onChange={(event) => setFormState((prev) => ({ ...prev, impactScope: event.target.value }))}
              className="mt-1 min-h-[72px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Schedule Impact (days)
            <input
              type="number"
              value={formState.impactScheduleDays}
              onChange={(event) => setFormState((prev) => ({ ...prev, impactScheduleDays: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Budget Delta
            <input
              type="number"
              value={formState.impactBudgetDelta}
              onChange={(event) => setFormState((prev) => ({ ...prev, impactBudgetDelta: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Benefits Delta
            <input
              type="number"
              value={formState.impactBenefitsDelta}
              onChange={(event) => setFormState((prev) => ({ ...prev, impactBenefitsDelta: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Impact Risk Level
            <select
              value={formState.impactRiskLevel}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  impactRiskLevel: event.target.value as "Low" | "Medium" | "High" | "Critical"
                }))
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={formState.requiresCommitteeReview}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, requiresCommitteeReview: event.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            Requires committee review
          </label>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Field Deltas (Before vs After)</p>
            <button
              type="button"
              onClick={() => setFieldChanges((prev) => [...prev, emptyFieldChange()])}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            >
              Add Field
            </button>
          </div>
          <div className="space-y-2">
            {fieldChanges.map((row, index) => (
              <div key={`field-change-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <select
                  value={row.fieldName}
                  onChange={(event) =>
                    setFieldChanges((prev) =>
                      prev.map((item, cursor) =>
                        cursor === index ? { ...item, fieldName: event.target.value } : item
                      )
                    )
                  }
                  className="rounded-md border border-slate-300 bg-white px-2 py-2 text-xs"
                >
                  {fieldOptions.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
                <input
                  value={row.newValue}
                  onChange={(event) =>
                    setFieldChanges((prev) =>
                      prev.map((item, cursor) =>
                        cursor === index ? { ...item, newValue: event.target.value } : item
                      )
                    )
                  }
                  className="rounded-md border border-slate-300 bg-white px-2 py-2 text-xs"
                  placeholder="New value"
                />
                <button
                  type="button"
                  onClick={() =>
                    setFieldChanges((prev) => prev.filter((_, cursor) => cursor !== index))
                  }
                  className="rounded-md border border-red-200 bg-red-50 px-2 py-2 text-xs font-semibold text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => {
              void createDraft();
            }}
            disabled={busyId === "create"}
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {busyId === "create" ? "Saving..." : "Save Draft CR"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">All Change Requests</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-2 text-left">CR ID</th>
                <th className="px-2 py-2 text-left">Project</th>
                <th className="px-2 py-2 text-left">Type</th>
                <th className="px-2 py-2 text-left">Severity</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-right">Budget Delta</th>
                <th className="px-2 py-2 text-right">Schedule</th>
                <th className="px-2 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-left text-slate-500">
                    No change requests found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.changeRequest.id} className="border-t border-slate-100">
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2"
                        onClick={() => setSelectedId(row.changeRequest.id)}
                      >
                        {row.changeRequest.id}
                      </button>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => onOpenDrilldown(row.changeRequest.projectId)}
                        className="text-left text-slate-700 hover:text-brand-700"
                      >
                        {row.changeRequest.projectId}
                      </button>
                    </td>
                    <td className="px-2 py-2">{row.changeRequest.changeType.replaceAll("_", " ")}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${severityClass(row.changeRequest.changeSeverity)}`}>
                        {row.changeRequest.changeSeverity} ({row.changeRequest.changeSeverityScore})
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClass(row.changeRequest.status)}`}>
                        {row.changeRequest.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className={`px-2 py-2 text-right ${row.changeRequest.impactBudgetDelta >= 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {formatMoney(row.changeRequest.impactBudgetDelta)}
                    </td>
                    <td className="px-2 py-2 text-right">{row.changeRequest.impactScheduleDays}d</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {row.changeRequest.status === "DRAFT" ? (
                          <button
                            type="button"
                            onClick={() => {
                              void runAction(row.changeRequest.id, "submit");
                            }}
                            disabled={busyId === `submit-${row.changeRequest.id}`}
                            className="rounded border border-brand-200 px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                          >
                            Submit
                          </button>
                        ) : null}
                        {(row.changeRequest.status === "SUBMITTED" || row.changeRequest.status === "UNDER_REVIEW") ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                void runAction(row.changeRequest.id, "approve");
                              }}
                              disabled={busyId === `approve-${row.changeRequest.id}`}
                              className="rounded border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void runAction(row.changeRequest.id, "reject");
                              }}
                              disabled={busyId === `reject-${row.changeRequest.id}`}
                              className="rounded border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
                            >
                              Reject
                            </button>
                            <input
                              value={decisionCommentById[row.changeRequest.id] ?? ""}
                              onChange={(event) =>
                                setDecisionCommentById((prev) => ({
                                  ...prev,
                                  [row.changeRequest.id]: event.target.value
                                }))
                              }
                              className="rounded border border-slate-300 px-2 py-1 text-[11px]"
                              placeholder="Decision comment"
                            />
                          </>
                        ) : null}
                        {row.changeRequest.status === "APPROVED" ? (
                          <button
                            type="button"
                            onClick={() => {
                              void runAction(row.changeRequest.id, "implement");
                            }}
                            disabled={busyId === `implement-${row.changeRequest.id}`}
                            className="rounded border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                          >
                            Implement
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRow ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Change Request Detail</h3>
              <p className="text-xs text-slate-600">
                {selectedRow.changeRequest.id} · {selectedRow.changeRequest.projectId} · {selectedRow.changeRequest.title}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
            >
              Close
            </button>
          </div>

          <div className="mt-3 grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Before vs After Diff</p>
              <div className="mt-2 space-y-2">
                {selectedRow.deltas.map((delta) => (
                  <div key={delta.id} className="rounded-md border border-slate-200 bg-white p-2 text-xs">
                    <p className="font-semibold text-slate-700">{delta.fieldName}</p>
                    <div className="mt-1 grid gap-1 md:grid-cols-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Before</p>
                        <p className="break-all text-slate-700">{String(delta.oldValue ?? "-")}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">After</p>
                        <p className="break-all font-medium text-brand-700">{String(delta.newValue ?? "-")}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Approval Path</p>
              <div className="mt-2 space-y-2">
                {selectedRow.approvals.map((approval) => (
                  <div key={approval.id} className="rounded-md border border-slate-200 bg-white p-2 text-xs">
                    <p className="font-semibold text-slate-700">{approval.roleContext}</p>
                    <p className="text-slate-600">
                      {approval.approverName} ({approval.approverEmail})
                    </p>
                    <p className="text-slate-500">
                      Status: {approval.status} · Requested {formatDateTime(approval.requestedAt)} · Decided {formatDateTime(approval.decidedAt)}
                    </p>
                    {approval.comment ? <p className="mt-1 text-slate-600">Comment: {approval.comment}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Discussion Thread</p>
              <div className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1">
                {selectedRow.comments.map((comment) => (
                  <div key={comment.id} className="rounded-md border border-slate-200 bg-white p-2 text-xs">
                    <p className="font-semibold text-slate-700">{comment.authorName}</p>
                    <p className="text-slate-500">{formatDateTime(comment.createdAt)}</p>
                    <p className="mt-1 text-slate-700">{comment.comment}</p>
                  </div>
                ))}
                {selectedRow.comments.length === 0 ? <p className="text-xs text-slate-500">No comments yet.</p> : null}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={discussionComment}
                  onChange={(event) => setDiscussionComment(event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs"
                  placeholder="Add discussion comment"
                />
                <button
                  type="button"
                  onClick={() => {
                    void addDiscussionComment();
                  }}
                  disabled={busyId === `comment-${selectedRow.changeRequest.id}`}
                  className="rounded-md border border-brand-200 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Attachments</p>
              <div className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1">
                {selectedRow.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-md border border-slate-200 bg-white p-2 text-xs hover:border-brand-200"
                  >
                    <p className="font-semibold text-brand-700">{attachment.fileName}</p>
                    <p className="text-slate-500">{formatDateTime(attachment.uploadedAt)}</p>
                  </a>
                ))}
                {selectedRow.attachments.length === 0 ? <p className="text-xs text-slate-500">No attachments yet.</p> : null}
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <input
                  value={attachmentName}
                  onChange={(event) => setAttachmentName(event.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-2 text-xs"
                  placeholder="File name"
                />
                <input
                  value={attachmentUrl}
                  onChange={(event) => setAttachmentUrl(event.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-2 text-xs"
                  placeholder="https://..."
                />
                <button
                  type="button"
                  onClick={() => {
                    void addAttachment();
                  }}
                  disabled={busyId === `attachment-${selectedRow.changeRequest.id}`}
                  className="rounded-md border border-brand-200 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Loading change management data...</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
