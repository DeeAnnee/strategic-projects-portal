import IntakeForm from "@/components/submissions/intake-form";
import { projectVisibilityScope } from "@/lib/auth/rbac";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function NewSubmissionPage() {
  const session = await getSessionOrRedirect("projects");
  const visibility = projectVisibilityScope(session.user, "projects");
  if (visibility === "ASSIGNED" || visibility === "NONE") {
    redirect("/submissions");
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Strategic Projects Portal | New Proposal</h2>
        <p className="text-sm text-slate-600">
          A new Project ID will be generated only when you click Save Draft or Submit.
        </p>
      </div>
      <IntakeForm />
    </div>
  );
}
