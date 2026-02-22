import { NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api";
import { resolveReportRunForExport } from "@/lib/reporting/export-service";
import { buildExcelWorkbookXml } from "@/lib/reporting/exports";
import { exportSchema } from "@/lib/reporting/schema";

export async function POST(request: Request) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = exportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Validation failed",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  try {
    const run = await resolveReportRunForExport(access.principal, parsed.data);
    const xml = buildExcelWorkbookXml(run);
    const filename = `${run.reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "report"}-${new Date()
      .toISOString()
      .slice(0, 10)}.xls`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate Excel export.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ message }, { status });
  }
}
