import { NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api";
import { templateSaveSchema } from "@/lib/reporting/schema";
import { listTemplatesForPrincipal } from "@/lib/reporting/store";
import { saveTemplate } from "@/lib/reporting/service";

export async function GET(request: Request) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const templates = await listTemplatesForPrincipal(access.principal, search);
  return NextResponse.json({ data: templates });
}

export async function POST(request: Request) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  const body = await request.json();
  const parsed = templateSaveSchema.safeParse(body);

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
    const saved = await saveTemplate(access.principal, parsed.data);
    return NextResponse.json({ data: saved }, { status: parsed.data.id ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save template.";
    const status = message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ message }, { status });
  }
}
