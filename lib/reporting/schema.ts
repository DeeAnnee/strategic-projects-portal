import { z } from "zod";

const filterSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(["eq", "neq", "contains", "in", "gt", "gte", "lt", "lte", "between"]),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number()]))
  ])
});

const sortSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(["asc", "desc"])
});

const valueSchema = z.object({
  field: z.string().min(1),
  label: z.string().min(1),
  aggregation: z.enum(["sum", "avg", "min", "max", "count", "distinct_count"]),
  format: z.enum(["number", "currency", "percent"]).optional()
});

const visualSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["table", "line", "bar", "stacked_bar", "area", "scatter", "donut", "pie", "kpi", "heatmap"]),
  xField: z.string().optional(),
  yField: z.string().optional(),
  seriesField: z.string().optional(),
  metricField: z.string().optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional()
});

const calculationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["ARITHMETIC", "VARIANCE", "VARIANCE_PCT", "MOM", "QOQ", "YOY", "FOF", "ROLLING", "YTD", "IF_CASE", "RANK"]),
  outputField: z.string().min(1),
  expression: z.string().optional(),
  config: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

const parameterSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["date", "daterange", "fiscal_year", "string", "select"]),
  required: z.boolean(),
  defaultValue: z.string().optional(),
  options: z.array(z.string()).optional()
});

const viewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rows: z.array(z.string()),
  columns: z.array(z.string()),
  values: z.array(valueSchema),
  filters: z.array(filterSchema),
  sort: z.array(sortSchema),
  pageSize: z.number().int().positive(),
  showTotals: z.boolean(),
  pivotMode: z.boolean(),
  visuals: z.array(visualSchema)
});

const definitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  datasetIds: z.array(z.string().min(1)).min(1),
  fiscalCalendarId: z.string().min(1),
  views: z.array(viewSchema).min(1),
  calculations: z.array(calculationSchema).default([]),
  parameters: z.array(parameterSchema).default([]),
  formatting: z
    .object({
      currency: z.string().optional(),
      decimals: z.number().int().min(0).max(6).optional()
    })
    .optional()
});

export const reportSaveSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  description: z.string().default(""),
  tags: z.array(z.string()).optional(),
  sourceTemplateId: z.string().optional(),
  definition: definitionSchema
});

export const templateSaveSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  description: z.string().default(""),
  tags: z.array(z.string()).optional(),
  isFeatured: z.boolean().optional(),
  definition: definitionSchema
});

export const shareSchema = z.object({
  viewers: z.array(z.string().email()).optional(),
  editors: z.array(z.string().email()).optional()
});

export const runSchema = z.object({
  viewId: z.string().optional(),
  parameters: z.record(z.string()).optional(),
  filters: z.array(filterSchema).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional()
});

export const datasetRegisterSchema = z.object({
  datasetId: z.string().min(1),
  datasetName: z.string().min(1),
  description: z.string().min(1),
  owner: z.string().min(1),
  refreshSchedule: z.string().min(1),
  primaryKeys: z.array(z.string().min(1)).min(1),
  dimensions: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      role: z.literal("DIMENSION"),
      type: z.enum(["string", "number", "date", "boolean"]),
      description: z.string().optional(),
      allowedAggregations: z.array(z.enum(["sum", "avg", "min", "max", "count", "distinct_count"])).optional()
    })
  ),
  measures: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      role: z.literal("MEASURE"),
      type: z.enum(["string", "number", "date", "boolean"]),
      description: z.string().optional(),
      allowedAggregations: z.array(z.enum(["sum", "avg", "min", "max", "count", "distinct_count"])).optional()
    })
  ),
  allowedAggregations: z.array(z.enum(["sum", "avg", "min", "max", "count", "distinct_count"])).min(1),
  dataClassification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL"]),
  permissions: z.array(
    z.object({
      roleTypes: z.array(
        z.enum([
          "BASIC_USER",
          "FINANCE_GOVERNANCE_USER",
          "PROJECT_GOVERNANCE_USER",
          "SPO_COMMITTEE_HUB_USER",
          "PROJECT_MANAGEMENT_HUB_ADMIN",
          "PROJECT_MANAGEMENT_HUB_BASIC_USER",
          "ADMIN"
        ])
      ),
      level: z.enum(["VIEW", "BUILD"])
    })
  ),
  sampleQueries: z.array(z.string())
});

export const exportSchema = z.object({
  reportId: z.string().optional(),
  templateId: z.string().optional(),
  runInput: runSchema.optional(),
  mode: z.enum(["raw", "aggregated", "chart"]).optional(),
  includeInsightsNotes: z.boolean().optional()
});

export const runPreviewSchema = z.object({
  title: z.string().min(1),
  definition: definitionSchema,
  runInput: runSchema.optional()
});
