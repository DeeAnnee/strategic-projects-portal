import { NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api";
import { getReportForPrincipal } from "@/lib/reporting/store";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  const { id } = await context.params;
  const report = await getReportForPrincipal(access.principal, id);
  if (!report) {
    return NextResponse.json({ message: "Report not found." }, { status: 404 });
  }

  return NextResponse.json({ data: report });
}
