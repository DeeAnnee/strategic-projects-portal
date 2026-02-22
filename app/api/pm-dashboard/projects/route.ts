import { NextResponse } from "next/server";

import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import {
  getPmDashboardProjects,
  parsePmDashboardFiltersFromUrl,
  parsePmDashboardPaginationFromUrl
} from "@/lib/pm-dashboard/analytics";

export async function GET(request: Request) {
  const access = await requireApiPrincipal("project_management_hub");
  if ("error" in access) {
    return access.error;
  }

  const filters = parsePmDashboardFiltersFromUrl(request);
  const { page, pageSize } = parsePmDashboardPaginationFromUrl(request);
  const payload = await getPmDashboardProjects(toRbacPrincipal(access.principal), filters, page, pageSize);
  return NextResponse.json({ data: payload });
}

