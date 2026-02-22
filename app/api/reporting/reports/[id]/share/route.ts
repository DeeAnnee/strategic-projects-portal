import { NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api";
import { shareSchema } from "@/lib/reporting/schema";
import { shareReport } from "@/lib/reporting/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = shareSchema.safeParse(body);
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
    const updated = await shareReport(access.principal, id, parsed.data);
    return NextResponse.json({ data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to share report.";
    const status = message === "Forbidden" ? 403 : message.includes("not found") ? 404 : 400;
    return NextResponse.json({ message }, { status });
  }
}
