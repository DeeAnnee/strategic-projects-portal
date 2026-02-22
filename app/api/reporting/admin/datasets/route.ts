import { NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api";
import { datasetRegisterSchema } from "@/lib/reporting/schema";
import { canManageReportingAdmin, registerDataset } from "@/lib/reporting/store";

export async function POST(request: Request) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  if (!canManageReportingAdmin(access.principal)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = datasetRegisterSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Validation failed",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const saved = await registerDataset(access.principal, parsed.data);
  return NextResponse.json({ data: saved }, { status: 201 });
}
