import { notFound } from "next/navigation";

import IntakeForm from "@/components/submissions/intake-form";
import { canUserViewSubmission } from "@/lib/auth/project-access";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { getSubmissionById } from "@/lib/submissions/store";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ mode?: string }>;
};

export default async function EditSubmissionPage({ params, searchParams }: Props) {
  const session = await getSessionOrRedirect("projects");
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const forceReadOnly = query.mode === "view";
  const submission = await getSubmissionById(id);

  if (!submission) {
    notFound();
  }
  if (!canUserViewSubmission(session.user, submission, "projects")) {
    notFound();
  }

  const isBusinessCase = submission.stage !== "PROPOSAL";
  const pageTitle = forceReadOnly
    ? isBusinessCase
      ? "View Business Case"
      : "View Proposal"
    : isBusinessCase
      ? "Edit Business Case"
      : "Edit Proposal";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Strategic Projects Portal | {pageTitle}</h2>
        <p className="text-sm text-slate-600">
          Project ID: {submission.id}. {forceReadOnly ? "Read-only view is active." : "Draft autosave remains enabled."}
        </p>
      </div>
      <IntakeForm initialData={submission} forceReadOnly={forceReadOnly} />
    </div>
  );
}
