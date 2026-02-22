import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { canUserViewSubmission, filterSubmissionsByAccess } from "@/lib/auth/project-access";
import {
  generateIntakeSummaryPdf,
  generateSimplePdf,
  generateSubmissionSummaryLines
} from "@/lib/reports/generate";
import { getSubmissionById, listSubmissions } from "@/lib/submissions/store";

export async function GET(request: Request) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return new Response(access.error.status === 401 ? "Unauthorized" : "Forbidden", {
      status: access.error.status
    });
  }
  const principal = toRbacPrincipal(access.principal);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const mode = searchParams.get("mode");

  if (id) {
    const item = await getSubmissionById(id);
    if (!item) {
      return new Response("Not found", { status: 404 });
    }
    if (!canUserViewSubmission(principal, item, "dashboard")) {
      return new Response("Forbidden", { status: 403 });
    }

    const title =
      mode === "intake-summary"
        ? `Intake Summary - ${item.id}`
        : `Project Summary - ${item.id}`;
    const pdf =
      mode === "intake-summary"
        ? generateIntakeSummaryPdf(item)
        : generateSimplePdf(title, generateSubmissionSummaryLines(item));
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${item.id.toLowerCase()}-${mode === "intake-summary" ? "intake-summary" : "summary"}.pdf"`
      }
    });
  }

  const rows = filterSubmissionsByAccess(principal, await listSubmissions(), "dashboard");
  const bodyLines = rows.slice(0, 12).map((row) => `${row.id} | ${row.title} | ${row.stage} | ${row.status}`);
  const pdf = generateSimplePdf("Strategic Projects Executive Summary", bodyLines);

  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="strategic-projects-summary-${new Date().toISOString().slice(0, 10)}.pdf"`
    }
  });
}
