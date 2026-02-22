import { NextResponse } from "next/server";

import { canUserViewSubmission } from "@/lib/auth/project-access";
import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { changeRequestQuerySchema, createChangeRequestSchema } from "@/lib/change-management/schema";
import {
  createChangeRequestDraft,
  getChangeRequestTemplatesAndThresholds,
  isSubmissionEligibleForChangeManagement,
  listChangeRequestsWithDetails
} from "@/lib/change-management/service";
import { getSubmissionById } from "@/lib/submissions/store";

export async function GET(request: Request) {
  const access = await requireApiPrincipal("project_management_hub");
  if ("error" in access) {
    return access.error;
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = changeRequestQuerySchema.safeParse({
    projectId: searchParams.get("projectId") ?? undefined
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { message: "Validation failed", issues: parsedQuery.error.flatten() },
      { status: 400 }
    );
  }

  const principal = access.principal;
  const rbacPrincipal = toRbacPrincipal(principal);
  const rows = await listChangeRequestsWithDetails(parsedQuery.data.projectId);
  const submissionCache = new Map<string, Awaited<ReturnType<typeof getSubmissionById>>>();

  const visibleRows = [];
  for (const row of rows) {
    let submission = submissionCache.get(row.changeRequest.projectId);
    if (submission === undefined) {
      submission = await getSubmissionById(row.changeRequest.projectId);
      submissionCache.set(row.changeRequest.projectId, submission);
    }
    if (!submission) continue;
    if (!canUserViewSubmission(rbacPrincipal, submission, "projects")) continue;
    visibleRows.push({
      ...row,
      project: {
        id: submission.id,
        title: submission.title,
        stage: submission.stage,
        status: submission.status,
        isEligible: isSubmissionEligibleForChangeManagement(submission)
      }
    });
  }

  const meta = await getChangeRequestTemplatesAndThresholds();
  return NextResponse.json({
    data: visibleRows,
    meta
  });
}

export async function POST(request: Request) {
  const access = await requireApiPrincipal("project_management_hub");
  if ("error" in access) {
    return access.error;
  }

  const payload = await request.json();
  const parsed = createChangeRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const submission = await getSubmissionById(parsed.data.projectId);
  if (!submission) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }
  if (!canUserViewSubmission(toRbacPrincipal(access.principal), submission, "projects")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const created = await createChangeRequestDraft(access.principal, {
      ...parsed.data,
      fieldChanges: parsed.data.fieldChanges.map((change) => ({
        fieldName: change.fieldName,
        newValue: change.newValue
      }))
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to create Change Request." },
      { status: 400 }
    );
  }
}
