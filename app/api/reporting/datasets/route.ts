import { NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api";
import { listDatasetsForPrincipal, readDatasetRegistry } from "@/lib/reporting/store";

export async function GET() {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  const [datasets, registry] = await Promise.all([
    listDatasetsForPrincipal(access.principal, "VIEW"),
    readDatasetRegistry()
  ]);

  return NextResponse.json({
    data: {
      datasets,
      fiscalCalendars: registry.fiscalCalendars,
      glossary: registry.glossary
    }
  });
}
