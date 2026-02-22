import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { filterSubmissionsByAccess } from "@/lib/auth/project-access";
import { generateCsvReport } from "@/lib/reports/generate";
import { listSubmissions } from "@/lib/submissions/store";

export async function GET() {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return new Response(access.error.status === 401 ? "Unauthorized" : "Forbidden", {
      status: access.error.status
    });
  }

  const rows = filterSubmissionsByAccess(toRbacPrincipal(access.principal), await listSubmissions(), "dashboard");
  const csv = generateCsvReport(rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="strategic-projects-${new Date().toISOString().slice(0, 10)}.csv"`
    }
  });
}
