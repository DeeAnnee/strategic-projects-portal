import { NextResponse } from "next/server";

import { canUserViewSubmission } from "@/lib/auth/project-access";
import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { submitChangeRequest } from "@/lib/change-management/service";
import { getSubmissionById } from "@/lib/submissions/store";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("project_management_hub");
  if ("error" in access) {
    return access.error;
  }

  const { id } = await context.params;

  try {
    const details = await submitChangeRequest(id, access.principal);
    const submission = await getSubmissionById(details.changeRequest.projectId);
    if (!submission) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }
    if (!canUserViewSubmission(toRbacPrincipal(access.principal), submission, "projects")) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ data: details });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to submit Change Request." },
      { status: 400 }
    );
  }
}
