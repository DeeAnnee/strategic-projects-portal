import { NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api";
import { getDatasetByIdForPrincipal } from "@/lib/reporting/store";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  const { id } = await context.params;
  const dataset = await getDatasetByIdForPrincipal(access.principal, id, "VIEW");

  if (!dataset) {
    return NextResponse.json({ message: "Dataset not found or not permitted." }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      datasetId: dataset.datasetId,
      datasetName: dataset.datasetName,
      dimensions: dataset.dimensions,
      measures: dataset.measures,
      allowedAggregations: dataset.allowedAggregations,
      sampleQueries: dataset.sampleQueries
    }
  });
}
