import { NextResponse } from "next/server";

import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { canUserEditSubmission, canUserViewSubmission } from "@/lib/auth/project-access";
import { appendGovernanceAuditLog } from "@/lib/governance/audit-log";
import { workflowActionSchema } from "@/lib/submissions/schema";
import { getSubmissionById, runWorkflowAction } from "@/lib/submissions/store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("projects");
  if ("error" in access) {
    return access.error;
  }
  const principal = access.principal;
  const rbacUser = toRbacPrincipal(principal);

  const body = await request.json();
  const parsed = workflowActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;
  const current = await getSubmissionById(id);
  if (!current) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (!canUserViewSubmission(rbacUser, current, "projects")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const action = parsed.data.action;
  const allowedFormActions = new Set(["SEND_TO_SPONSOR", "SUBMIT_FUNDING_REQUEST", "RAISE_CHANGE_REQUEST"]);
  if (!allowedFormActions.has(action)) {
    return NextResponse.json(
      { message: "Approval decisions are only available in the Approvals section." },
      { status: 400 }
    );
  }
  const writeAudit = async (
    outcome: "SUCCESS" | "FAILED" | "DENIED",
    details: string
  ) => {
    try {
      await appendGovernanceAuditLog({
        area: "WORKFLOW",
        action,
        entityType: "submission",
        entityId: id,
        outcome,
        actorName: principal.name ?? "Workflow User",
        actorEmail: principal.email ?? undefined,
        actorRole: principal.roleType,
        details
      });
    } catch {
      // Non-blocking audit write.
    }
  };

  if (!canUserEditSubmission(rbacUser, current)) {
    await writeAudit("DENIED", "Workflow action denied: actor cannot edit this project.");
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let updated = null;
  try {
    updated = await runWorkflowAction(id, action, {
      actorName: principal.name ?? "Workflow User",
      actorEmail: principal.email ?? undefined,
      actorUserId: principal.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workflow action failed";
    await writeAudit("FAILED", message);
    return NextResponse.json({ message }, { status: 400 });
  }

  if (!updated) {
    await writeAudit("FAILED", "Workflow action failed because submission was not found after update.");
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  await writeAudit("SUCCESS", `Workflow action completed. Stage=${updated.stage}, Status=${updated.status}.`);

  return NextResponse.json({ data: updated });
}
