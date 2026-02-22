import { NextResponse } from "next/server";

import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import {
  getPmDashboardScheduleCharts,
  parsePmDashboardFiltersFromUrl
} from "@/lib/pm-dashboard/analytics";

export async function GET(request: Request) {
  const access = await requireApiPrincipal("project_management_hub");
  if ("error" in access) {
    return access.error;
  }

  const filters = parsePmDashboardFiltersFromUrl(request);
  const payload = await getPmDashboardScheduleCharts(toRbacPrincipal(access.principal), filters);
  return NextResponse.json({ data: payload });
}

