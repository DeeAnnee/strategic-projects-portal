import { NextResponse } from "next/server";

import { canUserViewSubmission } from "@/lib/auth/project-access";
import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { getProjectChangeLog } from "@/lib/change-management/service";
import { getSubmissionById } from "@/lib/submissions/store";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("projects");
  if ("error" in access) {
    return access.error;
  }

  const { id } = await context.params;
  const submission = await getSubmissionById(id);
  if (!submission) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (!canUserViewSubmission(toRbacPrincipal(access.principal), submission, "projects")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const payload = await getProjectChangeLog(id);
  return NextResponse.json({ data: payload });
}
