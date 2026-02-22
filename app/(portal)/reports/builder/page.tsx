import Link from "next/link";

import ReportBuilder from "@/components/reports/report-builder";
import { getSessionOrRedirect } from "@/lib/auth/session";

type Props = {
  searchParams?: Promise<{ reportId?: string; templateId?: string }>;
};

export default async function ReportBuilderPage({ searchParams }: Props) {
  await getSessionOrRedirect("dashboard");
  const params = searchParams ? await searchParams : {};

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <Link href="/reports" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Reports Home
        </Link>
        <Link href="/reports/builder" className="rounded-md bg-brand-700 px-3 py-2 text-xs font-semibold text-white">
          Report Builder
        </Link>
        <Link href="/reports/templates" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Template Library
        </Link>
      </nav>

      <ReportBuilder reportId={params.reportId} templateId={params.templateId} />
    </div>
  );
}
