import CopilotPanel from "@/components/copilot/CopilotPanel";
import { getSessionOrRedirect } from "@/lib/auth/session";

export default async function AiHelperPage() {
  await getSessionOrRedirect("stratos_lab");

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">STRATOS Project Copilot</h1>
        <p className="mt-1 text-sm text-slate-600">
          ChatGPT-style assistant for SMART task writing, risks, KPIs, executive summaries, and insights.
        </p>
      </header>
      <CopilotPanel />
    </div>
  );
}
