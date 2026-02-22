import CopilotPanel from "@/components/copilot/CopilotPanel";
import { getSessionOrRedirect } from "@/lib/auth/session";

export default async function CopilotPage() {
  await getSessionOrRedirect("stratos_lab");

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Project Copilot</h1>
        <p className="mt-1 text-sm text-slate-600">
          Persistent AI workspace for project insights, task building, and governance artifacts.
        </p>
      </header>
      <CopilotPanel />
    </div>
  );
}
