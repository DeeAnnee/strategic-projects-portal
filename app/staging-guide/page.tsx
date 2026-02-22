import Link from "next/link";
import { notFound } from "next/navigation";

import { isStagingAppEnv } from "@/lib/runtime/app-env";
import { STAGING_TEST_ACCOUNTS } from "@/lib/staging/test-accounts";

const workflowSteps = [
  "Sign in as submitter@test.com and create a Proposal. Save Draft, then Submit.",
  "Sign in as bsponsor@test.com and approve in Approvals > Sent To Me.",
  "Complete PGO/FGO tasks from Project Governance Hub and Finance Governance Hub until both are done.",
  "In SPO Committee Hub, set decision to Approved and Save All Changes. Project moves to Funding Draft.",
  "Return as submitter@test.com, complete Funding form, then Submit.",
  "Approve funding sponsor requests using bsponsor@test.com, bdelegate@test.com, fsponsor@test.com, tsponsor@test.com, and benefits@test.com.",
  "Complete funding governance tasks in PGO/FGO hubs to reach Funding Approved.",
  "As admin@test.com, assign project manager in Project Management Hub > Resources & Workload.",
  "As pm@test.com, approve PM Assignment in Approvals to move project to Live / Active.",
  "Open Change Management tab in PM Hub and submit/approve a change request to validate audit and change lifecycle."
] as const;

export default function StagingGuidePage() {
  if (!isStagingAppEnv()) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="space-y-2 rounded-xl border border-brand-100 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Strategic Projects Portal</p>
        <h1 className="text-3xl font-semibold text-slate-900">Staging Test Guide</h1>
        <p className="text-sm text-slate-600">
          Public staging validation guide for full Proposal → Funding → Live workflow with approvals and change management.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/login" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Go to Login
          </Link>
          <Link href="/dashboard" className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            Open Portal
          </Link>
        </div>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Test Credentials</h2>
        <p className="mt-1 text-sm text-slate-600">
          All staging users use password <span className="font-semibold text-slate-800">password123</span>. These are staging-only accounts.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Name</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Email</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Role</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {STAGING_TEST_ACCOUNTS.map((account) => (
                <tr key={account.key} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{account.name}</td>
                  <td className="px-3 py-2 text-slate-700">{account.email}</td>
                  <td className="px-3 py-2 text-slate-700">{account.roleType}</td>
                  <td className="px-3 py-2 text-slate-700">{account.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Workflow Validation Steps</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          {workflowSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Expected Outcomes</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Approvals are only actioned in the Approvals module (Sent To Me / Sent By Me).</li>
          <li>RBAC module access is enforced server-side for every role.</li>
          <li>Project transitions follow canonical stage flow: Proposal → Funding → Live.</li>
          <li>Funding Approved records lock the form (view-only) until PM Assignment completion.</li>
          <li>Change Requests are required for updates after project is in Live/Approved scope.</li>
          <li>In-app notifications continue; email and Teams are redirected/sandboxed in staging mode.</li>
        </ul>
      </section>
    </main>
  );
}

