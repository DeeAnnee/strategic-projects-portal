import { NextResponse } from "next/server";

import { canUserViewSubmission } from "@/lib/auth/project-access";
import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import {
  addChangeRequestAttachment,
  addChangeRequestComment,
  getChangeRequestDetails
} from "@/lib/change-management/service";
import { addChangeAttachmentSchema, addChangeCommentSchema } from "@/lib/change-management/schema";
import { getSubmissionById } from "@/lib/submissions/store";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("project_management_hub");
  if ("error" in access) {
    return access.error;
  }

  const { id } = await context.params;
  const details = await getChangeRequestDetails(id);
  if (!details) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const submission = await getSubmissionById(details.changeRequest.projectId);
  if (!submission) {
    return NextResponse.json({ message: "Project not found" }, { status: 404 });
  }
  if (!canUserViewSubmission(toRbacPrincipal(access.principal), submission, "projects")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    data: {
      ...details,
      project: {
        id: submission.id,
        title: submission.title,
        stage: submission.stage,
        status: submission.status
      }
    }
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("project_management_hub");
  if ("error" in access) {
    return access.error;
  }

  const { id } = await context.params;
  const details = await getChangeRequestDetails(id);
  if (!details) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const submission = await getSubmissionById(details.changeRequest.projectId);
  if (!submission) {
    return NextResponse.json({ message: "Project not found" }, { status: 404 });
  }
  if (!canUserViewSubmission(toRbacPrincipal(access.principal), submission, "projects")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json().catch(() => ({}));
  if (payload?.action === "add_comment") {
    const parsedComment = addChangeCommentSchema.safeParse(payload);
    if (!parsedComment.success) {
      return NextResponse.json(
        { message: "Validation failed", issues: parsedComment.error.flatten() },
        { status: 400 }
      );
    }
    try {
      const comment = await addChangeRequestComment(id, access.principal, parsedComment.data.comment);
      return NextResponse.json({ data: comment });
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "Unable to append comment." },
        { status: 400 }
      );
    }
  }

  if (payload?.action === "add_attachment") {
    const parsedAttachment = addChangeAttachmentSchema.safeParse(payload);
    if (!parsedAttachment.success) {
      return NextResponse.json(
        { message: "Validation failed", issues: parsedAttachment.error.flatten() },
        { status: 400 }
      );
    }
    try {
      const attachment = await addChangeRequestAttachment(id, access.principal, parsedAttachment.data);
      return NextResponse.json({ data: attachment });
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "Unable to append attachment." },
        { status: 400 }
      );
    }
  }

  return NextResponse.json(
    { message: "Unsupported action. Use action=add_comment or action=add_attachment." },
    { status: 400 }
  );
}
