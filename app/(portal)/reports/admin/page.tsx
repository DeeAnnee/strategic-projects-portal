import Link from "next/link";

import DatasetGovernance from "@/components/reports/dataset-governance";
import { getSessionOrRedirect } from "@/lib/auth/session";

export default async function ReportsAdminPage() {
  await getSessionOrRedirect("user_admin");

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <Link href="/reports" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Reports Home
        </Link>
        <Link href="/reports/builder" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Report Builder
        </Link>
        <Link href="/reports/admin" className="rounded-md bg-brand-700 px-3 py-2 text-xs font-semibold text-white">
          Dataset Governance
        </Link>
      </nav>

      <DatasetGovernance />
    </div>
  );
}
