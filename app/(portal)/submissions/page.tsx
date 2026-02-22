import Link from "next/link";

import { filterSubmissionsByAccess } from "@/lib/auth/project-access";
import { projectVisibilityScope } from "@/lib/auth/rbac";
import { listUsersSafe } from "@/lib/auth/users";
import { getProjectChangeIndicatorMap } from "@/lib/change-management/service";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { listSubmissions } from "@/lib/submissions/store";
import SubmissionsTable from "@/components/submissions/submissions-table";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  searchParams?: Promise<{ draftSaved?: string; caseId?: string }>;
};

export default async function SubmissionsPage({ searchParams }: Props) {
  const session = await getSessionOrRedirect("projects");
  const params = searchParams ? await searchParams : {};
  const draftSaved = params.draftSaved === "1";
  const savedCaseId = params.caseId;
  const [submissions, portalUsers] = await Promise.all([listSubmissions(), listUsersSafe()]);
  const visibleRows = filterSubmissionsByAccess(session.user, submissions, "projects");
  const changeIndicators = await getProjectChangeIndicatorMap(visibleRows.map((row) => row.id));
  const personDirectory = Object.fromEntries(
    portalUsers.map((user) => [
      user.email.toLowerCase(),
      {
        name: user.name,
        photoUrl: user.photoUrl ?? undefined
      }
    ])
  );
  const visibility = projectVisibilityScope(session.user, "projects");
  const canCreate = visibility === "OWN" || visibility === "ALL";

  return (
    <div className="space-y-5">
      {draftSaved ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Draft saved successfully{savedCaseId ? ` (${savedCaseId})` : ""}.
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Strategic Projects Portal | Projects</h2>
          <p className="mt-1 text-sm text-slate-600">Current user: {session.user.email}</p>
        </div>
        {canCreate ? (
          <Link
            href="/submissions/new"
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            New Submission +
          </Link>
        ) : (
          <span className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600">
            Read-only project access
          </span>
        )}
      </div>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white shadow-sm">
        <SubmissionsTable rows={visibleRows} changeIndicators={changeIndicators} personDirectory={personDirectory} />
      </section>
    </div>
  );
}
