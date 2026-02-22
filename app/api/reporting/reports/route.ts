import { NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api";
import { reportSaveSchema } from "@/lib/reporting/schema";
import { listReportsForPrincipal } from "@/lib/reporting/store";
import { saveReport } from "@/lib/reporting/service";

export async function GET(request: Request) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";

  const reports = await listReportsForPrincipal(access.principal, search);
  return NextResponse.json({ data: reports });
}

export async function POST(request: Request) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  const body = await request.json();
  const parsed = reportSaveSchema.safeParse(body);
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
    const saved = await saveReport(access.principal, parsed.data);
    return NextResponse.json({ data: saved }, { status: parsed.data.id ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save report.";
    const status = message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ message }, { status });
  }
}
