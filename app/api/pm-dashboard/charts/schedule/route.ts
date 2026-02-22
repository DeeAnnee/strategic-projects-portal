import { NextResponse } from "next/server";

import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import {
  getPmDashboardScheduleCharts,
  parsePmDashboardFiltersFromUrl
} from "@/lib/pm-dashboard/analytics";

export async function GET(request: Request) {
  try {
    const access = await requireApiPrincipal("project_management_hub");
    if ("error" in access) {
      return access.error;
    }

    const filters = parsePmDashboardFiltersFromUrl(request);
    const payload = await getPmDashboardScheduleCharts(toRbacPrincipal(access.principal), filters);
    return NextResponse.json({ data: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load PM dashboard schedule charts.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
