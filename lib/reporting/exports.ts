import type { ReportRunResult } from "@/lib/reporting/types";

const toCellValue = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
};

const escapeCsv = (value: unknown) => `"${String(toCellValue(value)).replaceAll('"', '""')}"`;

export const toCsv = (rows: Array<Record<string, unknown>>, columns?: string[]) => {
  if (rows.length === 0 && (!columns || columns.length === 0)) {
    return "";
  }

  const resolvedColumns = columns && columns.length > 0 ? columns : Object.keys(rows[0] ?? {});
  const header = resolvedColumns.map((column) => escapeCsv(column)).join(",");
  const lines = rows.map((row) => resolvedColumns.map((column) => escapeCsv(row[column])).join(","));
  return [header, ...lines].join("\n");
};

const xmlEscape = (value: unknown) =>
  String(toCellValue(value))
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const buildWorksheet = (name: string, columns: string[], rows: Array<Record<string, unknown>>) => {
  const headerXml = `<Row>${columns
    .map(
      (column) =>
        `<Cell ss:StyleID=\"Header\"><Data ss:Type=\"String\">${xmlEscape(column)}</Data></Cell>`
    )
    .join("")}</Row>`;

  const rowsXml = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const value = row[column];
          const isNumber = typeof value === "number" && Number.isFinite(value);
          const type = isNumber ? "Number" : "String";
          return `<Cell><Data ss:Type=\"${type}\">${xmlEscape(value)}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");

  return `<Worksheet ss:Name=\"${xmlEscape(name)}\"><Table>${headerXml}${rowsXml}</Table></Worksheet>`;
};

export const buildExcelWorkbookXml = (runResult: ReportRunResult) => {
  const reportRows = runResult.table.rows.map((row) => ({ ...row }));

  const dataRows = runResult.rawRows.map((row) => ({ ...row }));
  const dataColumns = dataRows.length > 0 ? Object.keys(dataRows[0] ?? {}) : [];

  const definitionsRows = [
    {
      property: "Report",
      value: runResult.reportTitle
    },
    {
      property: "Generated At",
      value: runResult.generatedAt
    },
    {
      property: "Datasets",
      value: runResult.datasetIds.join(", ")
    },
    {
      property: "Applied Parameters",
      value: JSON.stringify(runResult.appliedParameters)
    },
    {
      property: "Applied Filters",
      value: JSON.stringify(runResult.appliedFilters)
    },
    {
      property: "Calculations",
      value: JSON.stringify(runResult.view ? runResult.view.values : [])
    }
  ];

  const chartRows = runResult.charts.flatMap((chart) =>
    chart.data.map((row) => ({
      visual_id: chart.visualId,
      visual_title: chart.title,
      visual_type: chart.type,
      ...row
    }))
  );
  const chartColumns = chartRows.length > 0 ? Object.keys(chartRows[0] ?? {}) : ["visual_id", "visual_title", "visual_type"];

  const worksheets = [
    buildWorksheet("Report", runResult.table.columns, reportRows),
    buildWorksheet("Data", dataColumns, dataRows),
    buildWorksheet("Definitions", ["property", "value"], definitionsRows),
    buildWorksheet("Charts", chartColumns, chartRows)
  ].join("");

  return `<?xml version=\"1.0\"?>
<Workbook xmlns=\"urn:schemas-microsoft-com:office:spreadsheet\" xmlns:o=\"urn:schemas-microsoft-com:office:office\" xmlns:x=\"urn:schemas-microsoft-com:office:excel\" xmlns:ss=\"urn:schemas-microsoft-com:office:spreadsheet\">
  <Styles>
    <Style ss:ID=\"Header\">
      <Font ss:Bold=\"1\" ss:Color=\"#FFFFFF\"/>
      <Interior ss:Color=\"#8A1538\" ss:Pattern=\"Solid\"/>
      <Alignment ss:Horizontal=\"Center\" ss:Vertical=\"Center\"/>
    </Style>
  </Styles>
  ${worksheets}
</Workbook>`;
};

export const buildPowerPointOutline = (runResult: ReportRunResult) => {
  const lines: string[] = [];

  lines.push("CIBC Caribbean Strategic Projects Portal");
  lines.push("Reports Studio Deck");
  lines.push("");
  lines.push(`Report: ${runResult.reportTitle}`);
  lines.push(`Generated: ${new Date(runResult.generatedAt).toLocaleString()}`);
  lines.push(`Datasets: ${runResult.datasetIds.join(", ")}`);
  lines.push("");

  lines.push("Slide 1: Executive Summary");
  lines.push(runResult.insights.executiveSummary);
  lines.push("");

  runResult.charts.forEach((chart, index) => {
    lines.push(`Slide ${index + 2}: ${chart.title}`);
    lines.push(`Type: ${chart.type}`);
    lines.push(`Points: ${chart.data.length}`);

    const previewRows = chart.data.slice(0, 5);
    previewRows.forEach((row) => {
      lines.push(`- ${Object.entries(row)
        .map(([key, value]) => `${key}: ${String(value ?? "")}`)
        .join(" | ")}`);
    });

    lines.push("");
  });

  lines.push("Insights Notes");
  runResult.insights.bullets.forEach((insight) => {
    lines.push(`- [${insight.type}] ${insight.title}: ${insight.detail}`);
  });

  lines.push("");
  lines.push(`Filters: ${JSON.stringify(runResult.appliedFilters)}`);
  lines.push(`Parameters: ${JSON.stringify(runResult.appliedParameters)}`);

  return lines.join("\n");
};

export const buildRawExport = (
  runResult: ReportRunResult,
  mode: "raw" | "aggregated" | "chart" = "raw"
) => {
  if (mode === "aggregated") {
    return toCsv(runResult.table.rows, runResult.table.columns);
  }

  if (mode === "chart") {
    const rows = runResult.charts.flatMap((chart) =>
      chart.data.map((row) => ({ visual_id: chart.visualId, visual_title: chart.title, ...row }))
    );
    const columns = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];
    return toCsv(rows, columns);
  }

  const columns = runResult.rawRows.length > 0 ? Object.keys(runResult.rawRows[0] ?? {}) : [];
  return toCsv(runResult.rawRows, columns);
};
