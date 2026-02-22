import { NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api";
import { runReport } from "@/lib/reporting/engine";
import { runPreviewSchema } from "@/lib/reporting/schema";
import { listDatasetsForPrincipal } from "@/lib/reporting/store";
import type { SavedReport } from "@/lib/reporting/types";

export async function POST(request: Request) {
  const access = await requireApiPrincipal("dashboard");
  if ("error" in access) {
    return access.error;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = runPreviewSchema.safeParse(body);

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
    const pseudoReport: SavedReport = {
      id: "preview",
      type: "REPORT",
      title: parsed.data.title,
      description: parsed.data.definition.description,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      access: {
        ownerUserId: access.principal.id,
        ownerEmail: access.principal.email ?? "",
        viewers: [],
        editors: []
      },
      definition: parsed.data.definition,
      versions: []
    };

    const datasets = await listDatasetsForPrincipal(access.principal, "VIEW");
    const run = await runReport(access.principal, pseudoReport, datasets, parsed.data.runInput ?? {});
    return NextResponse.json({ data: run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run preview.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
