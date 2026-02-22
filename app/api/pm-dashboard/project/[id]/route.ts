import { NextResponse } from "next/server";

import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import {
  getPmDashboardDrilldown,
  parsePmDashboardFiltersFromUrl
} from "@/lib/pm-dashboard/analytics";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiPrincipal("project_management_hub");
    if ("error" in access) {
      return access.error;
    }

    const { id } = await context.params;
    const filters = parsePmDashboardFiltersFromUrl(request);
    const payload = await getPmDashboardDrilldown(toRbacPrincipal(access.principal), id, filters);
    if (!payload) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load PM dashboard drilldown.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
