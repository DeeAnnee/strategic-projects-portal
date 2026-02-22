import Link from "next/link";

import ReportViewer from "@/components/reports/report-viewer";
import { getSessionOrRedirect } from "@/lib/auth/session";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ kind?: string }>;
};

export default async function ReportViewerPage({ params, searchParams }: Props) {
  await getSessionOrRedirect("dashboard");
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const kind = query.kind === "template" ? "template" : "report";

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <Link href="/reports" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Reports Home
        </Link>
        <Link href="/reports/templates" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Templates
        </Link>
        <Link href={`/reports/builder?${kind === "template" ? `templateId=${encodeURIComponent(id)}` : `reportId=${encodeURIComponent(id)}`}`} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Open in Builder
        </Link>
      </nav>

      <ReportViewer id={id} kind={kind} />
    </div>
  );
}
