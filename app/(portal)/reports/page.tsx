import Link from "next/link";

import ReportsHome from "@/components/reports/reports-home";
import { getSessionOrRedirect } from "@/lib/auth/session";

export default async function ReportsHomePage() {
  await getSessionOrRedirect("dashboard");

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <Link href="/reports" className="rounded-md bg-brand-700 px-3 py-2 text-xs font-semibold text-white">
          Reports Home
        </Link>
        <Link href="/reports/builder" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Report Builder
        </Link>
        <Link href="/reports/templates" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Template Library
        </Link>
        <Link href="/reports/admin" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Dataset Governance
        </Link>
      </nav>

      <ReportsHome />
    </div>
  );
}
