import { describe, expect, it } from "vitest";

import { runReport } from "@/lib/reporting/engine";
import { generateInsights } from "@/lib/reporting/insights";
import { listDatasetsForPrincipal } from "@/lib/reporting/store";
import type { ApiPrincipal } from "@/lib/auth/api";
import type { SavedReport } from "@/lib/reporting/types";

const basicPrincipal: ApiPrincipal = {
  id: "u-basic-001",
  name: "Sofia Submitter",
  email: "submitter@portal.local",
  roleType: "BASIC_USER",
  role: "BASIC_USER",
  azureObjectId: "11111111-1111-1111-1111-111111111111",
  isActive: true
};

const adminPrincipal: ApiPrincipal = {
  id: "u-admin-001",
  name: "Ada Admin",
  email: "admin@portal.local",
  roleType: "ADMIN",
  role: "ADMIN",
  azureObjectId: "77777777-7777-7777-7777-777777777777",
  isActive: true
};

const mkReport = (datasetIds: string[]): SavedReport => ({
  id: "report-test",
  type: "REPORT",
  title: "Test Report",
  description: "",
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  access: {
    ownerUserId: adminPrincipal.id,
    ownerEmail: adminPrincipal.email ?? "",
    viewers: [],
    editors: []
  },
  definition: {
    name: "Test Report",
    description: "",
    datasetIds,
    fiscalCalendarId: "org_default",
    views: [
      {
        id: "v1",
        name: "Main",
        rows: ["stage"],
        columns: [],
        values: [{ field: "project_count", label: "Projects", aggregation: "sum" }],
        filters: [],
        sort: [],
        pageSize: 20,
        showTotals: true,
        pivotMode: true,
        visuals: [{ id: "chart-1", title: "By Stage", type: "bar", xField: "stage", yField: "Projects" }]
      }
    ],
    calculations: [],
    parameters: [],
    formatting: {
      currency: "USD",
      decimals: 2
    }
  },
  versions: []
});

describe("reporting dataset permissions", () => {
  it("restricts sensitive datasets for basic users", async () => {
    const datasets = await listDatasetsForPrincipal(basicPrincipal, "VIEW");
    const ids = new Set(datasets.map((dataset) => dataset.datasetId));

    expect(ids.has("projects")).toBe(true);
    expect(ids.has("hr_resources")).toBe(false);
  });

  it("allows admins to access all registered datasets", async () => {
    const datasets = await listDatasetsForPrincipal(adminPrincipal, "VIEW");
    const ids = new Set(datasets.map((dataset) => dataset.datasetId));

    expect(ids.has("projects")).toBe(true);
    expect(ids.has("hr_resources")).toBe(true);
    expect(ids.has("audit_status_events")).toBe(true);
  });
});

describe("reporting run engine", () => {
  it("builds table, charts, and insights for permitted datasets", async () => {
    const datasets = await listDatasetsForPrincipal(adminPrincipal, "VIEW");
    const report = mkReport(["projects"]);

    const result = await runReport(adminPrincipal, report, datasets, {
      viewId: "v1"
    });

    expect(result.table.columns.length).toBeGreaterThan(0);
    expect(result.charts.length).toBeGreaterThan(0);
    expect(result.insights.executiveSummary.length).toBeGreaterThan(0);
  });

  it("fails safely when no permitted dataset is available", async () => {
    const datasets = await listDatasetsForPrincipal(basicPrincipal, "VIEW");
    const report = mkReport(["hr_resources"]);

    await expect(runReport(basicPrincipal, report, datasets, {})).rejects.toThrow(
      "No permitted datasets available"
    );
  });
});

describe("insights engine", () => {
  it("returns deterministic bullets and summary", () => {
    const insights = generateInsights(
      {
        columns: ["stage", "Projects"],
        rows: [
          { stage: "Proposal", Projects: 10 },
          { stage: "Funding", Projects: 18 },
          { stage: "Delivery", Projects: 25 },
          { stage: "Closed", Projects: 40 }
        ],
        totals: { Projects: 93 },
        page: 1,
        pageSize: 20,
        totalRows: 4
      },
      [
        { stage: "Proposal", project_count: 10 },
        { stage: "Funding", project_count: 18 },
        { stage: "Delivery", project_count: 25 },
        { stage: "Closed", project_count: 40 }
      ]
    );

    expect(insights.bullets.length).toBeGreaterThan(0);
    expect(insights.executiveSummary).toContain("Projects");
  });
});
