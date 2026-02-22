import { NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api";
import { runSchema } from "@/lib/reporting/schema";
import { runSavedTemplateForPrincipal } from "@/lib/reporting/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = runSchema.safeParse(body);

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
    const run = await runSavedTemplateForPrincipal(access.principal, id, parsed.data);
    return NextResponse.json({ data: run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run template.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ message }, { status });
  }
}
