import { NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api";
import { getReportsHomePayload } from "@/lib/reporting/service";

export async function GET(request: Request) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const payload = await getReportsHomePayload(access.principal, search);

  return NextResponse.json({ data: payload });
}
