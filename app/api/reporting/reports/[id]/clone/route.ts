import { NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api";
import { cloneReport } from "@/lib/reporting/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title : undefined;

  try {
    const cloned = await cloneReport(access.principal, id, title);
    return NextResponse.json({ data: cloned }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to clone report.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ message }, { status });
  }
}
