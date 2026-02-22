import type { ApiPrincipal } from "@/lib/auth/api";
import { loadCombinedDatasetRowsForPrincipal, type ReportingDataRow } from "@/lib/reporting/data-source";
import { generateInsights } from "@/lib/reporting/insights";
import { readDatasetRegistry } from "@/lib/reporting/store";
import type {
  ReportCalculationDefinition,
  ReportFilterDefinition,
  ReportRunResult,
  ReportSortDefinition,
  ReportViewDefinition,
  ReportVisualDefinition,
  ReportVisualType,
  ReportingAggregation,
  ReportingDatasetDefinition,
  ReportQueryRunInput,
  SavedReport,
  SavedTemplate
} from "@/lib/reporting/types";

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replaceAll(",", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const toComparable = (value: unknown): string | number => {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value ?? "").toLowerCase();
};

const normalizeValue = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
};

const resolveFiscalStartMonth = (
  datasetRegistry: Awaited<ReturnType<typeof readDatasetRegistry>>,
  fiscalCalendarId: string
) => {
  const calendar = datasetRegistry.fiscalCalendars.find((item) => item.id === fiscalCalendarId);
  return calendar?.fiscalYearStartMonth ?? 11;
};

const resolveParameterValue = (value: unknown, parameters: Record<string, string>) => {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed.startsWith("{{") || !trimmed.endsWith("}}")) {
    return value;
  }

  const key = trimmed.slice(2, -2).trim();
  return parameters[key] ?? "";
};

const toArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const evaluateFilter = (row: ReportingDataRow, filter: ReportFilterDefinition) => {
  const rowValue = row[filter.field];
  const compareValue = filter.value;

  switch (filter.operator) {
    case "eq":
      return toComparable(rowValue) === toComparable(compareValue);
    case "neq":
      return toComparable(rowValue) !== toComparable(compareValue);
    case "contains":
      return String(rowValue ?? "").toLowerCase().includes(String(compareValue ?? "").toLowerCase());
    case "in": {
      const values = toArray(compareValue);
      return values.map((item) => item.toLowerCase()).includes(String(rowValue ?? "").toLowerCase());
    }
    case "gt":
      return toNumber(rowValue) > toNumber(compareValue);
    case "gte":
      return toNumber(rowValue) >= toNumber(compareValue);
    case "lt":
      return toNumber(rowValue) < toNumber(compareValue);
    case "lte":
      return toNumber(rowValue) <= toNumber(compareValue);
    case "between": {
      const values = Array.isArray(compareValue) ? compareValue : [];
      if (values.length < 2) return true;
      const min = toNumber(values[0]);
      const max = toNumber(values[1]);
      const value = toNumber(rowValue);
      return value >= min && value <= max;
    }
    default:
      return true;
  }
};

const aggregate = (values: number[], method: ReportingAggregation) => {
  if (method === "count") return values.length;
  if (values.length === 0) return 0;

  switch (method) {
    case "sum":
      return values.reduce((sum, value) => sum + value, 0);
    case "avg":
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "distinct_count":
      return new Set(values).size;
    default:
      return values.reduce((sum, value) => sum + value, 0);
  }
};

const arithmeticExpression = (expression: string, context: Record<string, number>) => {
  const sanitized = expression.replace(/\s+/g, " ").trim();
  if (!sanitized) return 0;

  const tokens = sanitized.split(" ");
  let total = 0;
  let operator: "+" | "-" | "*" | "/" = "+";

  tokens.forEach((token) => {
    if (token === "+" || token === "-" || token === "*" || token === "/") {
      operator = token;
      return;
    }

    const numericValue = token in context ? context[token] : toNumber(token);

    switch (operator) {
      case "+":
        total += numericValue;
        break;
      case "-":
        total -= numericValue;
        break;
      case "*":
        total *= numericValue;
        break;
      case "/":
        total = numericValue === 0 ? total : total / numericValue;
        break;
      default:
        break;
    }
  });

  return total;
};

const applyCalculations = (
  rows: Array<Record<string, string | number | boolean | null>>,
  calculations: ReportCalculationDefinition[]
) => {
  if (calculations.length === 0 || rows.length === 0) {
    return rows;
  }

  const nextRows = rows.map((row) => ({ ...row }));

  const applyIndexedCalculation = (
    field: string,
    outputField: string,
    compute: (current: number, index: number, values: number[]) => number
  ) => {
    const values = nextRows.map((row) => toNumber(row[field]));
    nextRows.forEach((row, index) => {
      row[outputField] = compute(values[index] ?? 0, index, values);
    });
  };

  calculations.forEach((calculation) => {
    switch (calculation.type) {
      case "ARITHMETIC": {
        const expression = calculation.expression ?? "";
        nextRows.forEach((row) => {
          const numericContext: Record<string, number> = {};
          Object.entries(row).forEach(([key, value]) => {
            numericContext[key] = toNumber(value);
          });
          row[calculation.outputField] = arithmeticExpression(expression, numericContext);
        });
        break;
      }
      case "VARIANCE": {
        const minuendField = String(calculation.config?.minuendField ?? "");
        const subtrahendField = String(calculation.config?.subtrahendField ?? "");
        nextRows.forEach((row) => {
          row[calculation.outputField] = toNumber(row[minuendField]) - toNumber(row[subtrahendField]);
        });
        break;
      }
      case "VARIANCE_PCT": {
        const minuendField = String(calculation.config?.minuendField ?? "");
        const subtrahendField = String(calculation.config?.subtrahendField ?? "");
        nextRows.forEach((row) => {
          const base = toNumber(row[subtrahendField]);
          const delta = toNumber(row[minuendField]) - base;
          row[calculation.outputField] = base === 0 ? 0 : (delta / base) * 100;
        });
        break;
      }
      case "MOM":
      case "QOQ":
      case "YOY":
      case "FOF": {
        const baseField = String(calculation.config?.baseField ?? "");
        const periodOffset =
          calculation.type === "MOM" ? 1 : calculation.type === "QOQ" ? 1 : calculation.type === "YOY" ? 1 : 1;
        applyIndexedCalculation(baseField, calculation.outputField, (current, index, values) => {
          if (index < periodOffset) return 0;
          return current - (values[index - periodOffset] ?? 0);
        });
        break;
      }
      case "ROLLING": {
        const baseField = String(calculation.config?.baseField ?? "");
        const windowSize = Math.max(1, Number(calculation.config?.window ?? 3));
        applyIndexedCalculation(baseField, calculation.outputField, (_, index, values) => {
          const start = Math.max(0, index - windowSize + 1);
          const slice = values.slice(start, index + 1);
          const sum = slice.reduce((acc, value) => acc + value, 0);
          return sum;
        });
        break;
      }
      case "YTD": {
        const baseField = String(calculation.config?.baseField ?? "");
        applyIndexedCalculation(baseField, calculation.outputField, (_, index, values) => {
          const slice = values.slice(0, index + 1);
          return slice.reduce((acc, value) => acc + value, 0);
        });
        break;
      }
      case "IF_CASE": {
        const field = String(calculation.config?.field ?? "");
        const operator = String(calculation.config?.operator ?? "eq");
        const compareValue = calculation.config?.compareValue;
        const trueValue = calculation.config?.trueValue;
        const falseValue = calculation.config?.falseValue;

        nextRows.forEach((row) => {
          const passed = evaluateFilter(row as ReportingDataRow, {
            field,
            operator: operator as ReportFilterDefinition["operator"],
            value: compareValue as ReportFilterDefinition["value"]
          });
          row[calculation.outputField] = normalizeValue(passed ? trueValue : falseValue);
        });
        break;
      }
      case "RANK": {
        const field = String(calculation.config?.field ?? "");
        const ranked = [...nextRows]
          .map((row) => ({ row, value: toNumber(row[field]) }))
          .sort((left, right) => right.value - left.value);
        ranked.forEach((entry, index) => {
          entry.row[calculation.outputField] = index + 1;
        });
        break;
      }
      default:
        break;
    }
  });

  return nextRows;
};

const sortRows = (
  rows: Array<Record<string, string | number | boolean | null>>,
  sort: ReportSortDefinition[]
) => {
  if (sort.length === 0) {
    return rows;
  }

  const sorted = [...rows];
  sorted.sort((left, right) => {
    for (const rule of sort) {
      const leftValue = toComparable(left[rule.field]);
      const rightValue = toComparable(right[rule.field]);

      if (leftValue === rightValue) {
        continue;
      }

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return rule.direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
      }

      const compared = String(leftValue).localeCompare(String(rightValue));
      return rule.direction === "asc" ? compared : -compared;
    }

    return 0;
  });

  return sorted;
};

const paginateRows = <T,>(rows: T[], page: number, pageSize: number) => {
  const start = Math.max(0, (page - 1) * pageSize);
  return rows.slice(start, start + pageSize);
};

const buildCharts = (
  visuals: ReportVisualDefinition[],
  tableRows: Array<Record<string, string | number | boolean | null>>
) => {
  return visuals.map((visual) => {
    const xField = visual.xField ?? "";
    const yField = visual.yField ?? "";

    const chartRows = tableRows.map((row) => {
      const next: Record<string, string | number | null> = {};
      if (xField) {
        next[xField] = (row[xField] as string | number | null) ?? null;
      }
      if (yField) {
        next[yField] = toNumber(row[yField]);
      }
      if (visual.seriesField) {
        next[visual.seriesField] = (row[visual.seriesField] as string | number | null) ?? null;
      }
      if (visual.metricField) {
        next[visual.metricField] = toNumber(row[visual.metricField]);
      }
      return next;
    });

    const reduced =
      visual.type === "pie" || visual.type === "donut"
        ? buildCategoryAggregation(chartRows, xField, yField)
        : chartRows;

    return {
      visualId: visual.id,
      title: visual.title,
      type: visual.type,
      data: reduced
    };
  });
};

const buildCategoryAggregation = (
  rows: Array<Record<string, string | number | null>>,
  categoryField: string,
  valueField: string
) => {
  const bucket = new Map<string, number>();

  rows.forEach((row) => {
    const key = String(row[categoryField] ?? "Unspecified");
    const value = toNumber(row[valueField]);
    bucket.set(key, (bucket.get(key) ?? 0) + value);
  });

  return Array.from(bucket.entries()).map(([category, value]) => ({
    [categoryField]: category,
    [valueField]: value
  }));
};

const buildTable = (
  rows: ReportingDataRow[],
  view: ReportViewDefinition,
  calculations: ReportCalculationDefinition[],
  page: number,
  pageSize: number
) => {
  const groupFields = [...view.rows, ...view.columns];
  const grouped = new Map<string, { group: Record<string, string | number | boolean | null>; source: ReportingDataRow[] }>();

  rows.forEach((row) => {
    const groupPayload: Record<string, string | number | boolean | null> = {};
    groupFields.forEach((field) => {
      groupPayload[field] = normalizeValue(row[field]);
    });
    const groupKey = groupFields.map((field) => String(groupPayload[field] ?? "")).join("||");

    const existing = grouped.get(groupKey);
    if (!existing) {
      grouped.set(groupKey, {
        group: groupPayload,
        source: [row]
      });
      return;
    }

    existing.source.push(row);
  });

  const aggregatedRows = Array.from(grouped.values()).map((entry) => {
    const baseRow: Record<string, string | number | boolean | null> = { ...entry.group };
    view.values.forEach((valueDef) => {
      const collected = entry.source.map((row) => toNumber(row[valueDef.field]));
      baseRow[valueDef.label] = aggregate(collected, valueDef.aggregation);
    });
    return baseRow;
  });

  const withCalcs = applyCalculations(aggregatedRows, calculations);
  const sorted = sortRows(withCalcs, view.sort);
  const paged = paginateRows(sorted, page, pageSize);

  const metricColumns = new Set<string>([
    ...view.values.map((value) => value.label),
    ...calculations.map((calc) => calc.outputField)
  ]);

  const totals = Array.from(metricColumns).reduce<Record<string, number>>((acc, column) => {
    acc[column] = sorted.reduce((sum, row) => sum + toNumber(row[column]), 0);
    return acc;
  }, {});

  const columns = sorted.length > 0
    ? Object.keys(sorted[0] as Record<string, string | number | boolean | null>)
    : [...groupFields, ...view.values.map((value) => value.label), ...calculations.map((calc) => calc.outputField)];

  return {
    columns,
    rows: paged,
    totals,
    page,
    pageSize,
    totalRows: sorted.length,
    fullRows: sorted
  };
};

const resolveView = (
  report: SavedReport | SavedTemplate,
  viewId?: string
): ReportViewDefinition => {
  if (viewId) {
    const found = report.definition.views.find((view) => view.id === viewId);
    if (found) return found;
  }
  return report.definition.views[0] as ReportViewDefinition;
};

const resolveAppliedFilters = (
  view: ReportViewDefinition,
  runtimeFilters: ReportFilterDefinition[] | undefined,
  parameters: Record<string, string>
): ReportFilterDefinition[] => {
  const merged = [...view.filters, ...(runtimeFilters ?? [])];
  return merged.map((filter) => ({
    ...filter,
    value: resolveParameterValue(filter.value, parameters) as ReportFilterDefinition["value"]
  }));
};

const filterRows = (rows: ReportingDataRow[], filters: ReportFilterDefinition[]) => {
  if (filters.length === 0) return rows;
  return rows.filter((row) => filters.every((filter) => evaluateFilter(row, filter)));
};

const dedupeDatasets = (datasets: ReportingDatasetDefinition[]) => {
  const ids = new Set<string>();
  return datasets.filter((dataset) => {
    if (ids.has(dataset.datasetId)) return false;
    ids.add(dataset.datasetId);
    return true;
  });
};

export const runReport = async (
  principal: ApiPrincipal,
  report: SavedReport | SavedTemplate,
  allowedDatasets: ReportingDatasetDefinition[],
  input: ReportQueryRunInput = {}
): Promise<ReportRunResult> => {
  const datasetRegistry = await readDatasetRegistry();
  const availableDatasets = dedupeDatasets(allowedDatasets);
  const allowedDatasetIds = new Set(availableDatasets.map((dataset) => dataset.datasetId));
  const selectedDatasetIds = report.definition.datasetIds.filter((datasetId) =>
    allowedDatasetIds.has(datasetId)
  );

  if (selectedDatasetIds.length === 0) {
    throw new Error("No permitted datasets available for this report.");
  }

  const fiscalStartMonth = resolveFiscalStartMonth(datasetRegistry, report.definition.fiscalCalendarId);
  const rows = await loadCombinedDatasetRowsForPrincipal(principal, selectedDatasetIds, fiscalStartMonth);

  const view = resolveView(report, input.viewId);
  const parameters = input.parameters ?? {};
  const appliedFilters = resolveAppliedFilters(view, input.filters, parameters);

  const filteredRows = filterRows(rows, appliedFilters);

  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, input.pageSize ?? view.pageSize ?? 25);

  const table = buildTable(filteredRows, view, report.definition.calculations, page, pageSize);
  const charts = buildCharts(view.visuals, table.fullRows);
  const insights = generateInsights(
    {
      columns: table.columns,
      rows: table.fullRows,
      totals: table.totals,
      page,
      pageSize,
      totalRows: table.totalRows
    },
    filteredRows
  );

  return {
    reportId: report.id,
    reportTitle: report.title,
    datasetIds: selectedDatasetIds,
    view,
    appliedFilters,
    appliedParameters: parameters,
    generatedAt: new Date().toISOString(),
    table: {
      columns: table.columns,
      rows: table.rows,
      totals: table.totals,
      page,
      pageSize,
      totalRows: table.totalRows
    },
    charts,
    insights,
    rawRows: filteredRows
  };
};

export const buildLightweightChartSpec = (
  charts: ReportRunResult["charts"],
  requestedType?: ReportVisualType
) => {
  const selected = requestedType ? charts.filter((chart) => chart.type === requestedType) : charts;

  return selected.map((chart) => ({
    id: chart.visualId,
    type: chart.type,
    title: chart.title,
    points: chart.data.length
  }));
};
