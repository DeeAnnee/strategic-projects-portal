import { NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api";
import { getTemplateForPrincipal } from "@/lib/reporting/store";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  const { id } = await context.params;
  const template = await getTemplateForPrincipal(access.principal, id);
  if (!template) {
    return NextResponse.json({ message: "Template not found." }, { status: 404 });
  }

  return NextResponse.json({ data: template });
}
