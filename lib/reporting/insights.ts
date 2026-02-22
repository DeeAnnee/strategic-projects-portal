import type { InsightItem, ReportInsights, ReportTableResult } from "@/lib/reporting/types";
import type { ReportingDataRow } from "@/lib/reporting/data-source";

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replaceAll(",", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const mean = (values: number[]) => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const standardDeviation = (values: number[]) => {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const linearForecast = (values: number[]) => {
  if (values.length < 2) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  values.forEach((value, index) => {
    const x = index + 1;
    sumX += x;
    sumY += value;
    sumXY += x * value;
    sumXX += x * x;
  });

  const count = values.length;
  const denominator = count * sumXX - sumX ** 2;
  if (denominator === 0) return null;

  const slope = (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;
  return slope * (count + 1) + intercept;
};

const findPrimaryMetricColumn = (table: ReportTableResult): string | null => {
  const numericCandidates = table.columns.filter((column) => {
    if (column.toLowerCase().includes("id") || column.toLowerCase().includes("year")) {
      return false;
    }
    return table.rows.some((row) => typeof row[column] === "number");
  });

  if (numericCandidates.length > 0) {
    return numericCandidates[0] ?? null;
  }

  return null;
};

const buildTrendInsight = (table: ReportTableResult, metricColumn: string): InsightItem | null => {
  const values = table.rows
    .map((row) => toNumber(row[metricColumn]))
    .filter((value) => Number.isFinite(value));

  if (values.length < 2) {
    return null;
  }

  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const delta = last - first;
  const pct = first === 0 ? 0 : (delta / Math.abs(first)) * 100;

  const direction = delta >= 0 ? "increased" : "decreased";

  return {
    type: "trend",
    title: "Trend summary",
    detail: `${metricColumn} ${direction} by ${Math.abs(pct).toFixed(1)}% across the selected period (${first.toFixed(2)} to ${last.toFixed(2)}).`
  };
};

const buildDriverInsight = (table: ReportTableResult, metricColumn: string): InsightItem | null => {
  if (table.columns.length === 0 || table.rows.length === 0) {
    return null;
  }

  const dimensionColumn = table.columns.find((column) => column !== metricColumn);
  if (!dimensionColumn) {
    return null;
  }

  const ranked = [...table.rows]
    .map((row) => ({
      label: String(row[dimensionColumn] ?? "Unspecified"),
      value: toNumber(row[metricColumn])
    }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value));

  const top = ranked.slice(0, 3);
  if (top.length === 0) {
    return null;
  }

  return {
    type: "driver",
    title: "Top drivers",
    detail: `Largest contributors are ${top
      .map((item) => `${item.label} (${item.value.toLocaleString("en-US", { maximumFractionDigits: 2 })})`)
      .join(", ")}.`
  };
};

const buildAnomalyInsight = (table: ReportTableResult, metricColumn: string): InsightItem | null => {
  const series = table.rows.map((row) => toNumber(row[metricColumn]));
  if (series.length < 4) {
    return null;
  }

  const avg = mean(series);
  const std = standardDeviation(series);
  if (std === 0) {
    return null;
  }

  const anomalous = table.rows
    .map((row) => ({ row, value: toNumber(row[metricColumn]) }))
    .filter((entry) => Math.abs((entry.value - avg) / std) >= 2)
    .slice(0, 2);

  if (anomalous.length === 0) {
    return null;
  }

  const dimensionColumn = table.columns.find((column) => column !== metricColumn);
  const detail = anomalous
    .map((entry) => {
      const label = dimensionColumn ? String(entry.row[dimensionColumn] ?? "item") : "item";
      return `${label} (${entry.value.toFixed(2)})`;
    })
    .join(", ");

  return {
    type: "anomaly",
    title: "Anomaly detection",
    detail: `Detected outliers in ${metricColumn}: ${detail}.`
  };
};

const buildForecastInsight = (table: ReportTableResult, metricColumn: string): InsightItem | null => {
  const series = table.rows.map((row) => toNumber(row[metricColumn]));
  const forecast = linearForecast(series);
  if (forecast === null || !Number.isFinite(forecast)) {
    return null;
  }

  return {
    type: "forecast",
    title: "Forecast hint",
    detail: `Simple linear projection indicates next period ${metricColumn} at ${forecast.toLocaleString("en-US", {
      maximumFractionDigits: 2
    })}.`
  };
};

const buildQualityInsight = (rawRows: ReportingDataRow[]): InsightItem | null => {
  if (rawRows.length === 0) {
    return {
      type: "quality",
      title: "Data quality",
      detail: "No rows returned for this view. Adjust filters or parameters to retrieve data."
    };
  }

  const missingCount = rawRows.reduce((count, row) => {
    const rowMissing = Object.values(row).filter((value) => value === null || value === "").length;
    return count + rowMissing;
  }, 0);

  const zeroCount = rawRows.reduce((count, row) => {
    const rowZero = Object.values(row).filter((value) => typeof value === "number" && value === 0).length;
    return count + rowZero;
  }, 0);

  return {
    type: "quality",
    title: "Data quality flags",
    detail: `Found ${missingCount} missing values and ${zeroCount} zero-valued numeric cells in the current result set.`
  };
};

const toExecutiveSummary = (items: InsightItem[]) => {
  if (items.length === 0) {
    return "No significant changes detected for the selected report scope.";
  }

  const sentences = items.slice(0, 3).map((item) => item.detail);
  return sentences.join(" ");
};

export const generateInsights = (
  table: ReportTableResult,
  rawRows: ReportingDataRow[]
): ReportInsights => {
  const metricColumn = findPrimaryMetricColumn(table);
  const bullets: InsightItem[] = [];

  if (metricColumn) {
    const trend = buildTrendInsight(table, metricColumn);
    if (trend) bullets.push(trend);

    const drivers = buildDriverInsight(table, metricColumn);
    if (drivers) bullets.push(drivers);

    const anomaly = buildAnomalyInsight(table, metricColumn);
    if (anomaly) bullets.push(anomaly);

    const forecast = buildForecastInsight(table, metricColumn);
    if (forecast) bullets.push(forecast);
  }

  const quality = buildQualityInsight(rawRows);
  if (quality) {
    bullets.push(quality);
  }

  return {
    bullets,
    executiveSummary: toExecutiveSummary(bullets)
  };
};
