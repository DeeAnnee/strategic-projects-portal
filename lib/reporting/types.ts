import type { RoleType } from "@/lib/auth/roles";

export type ReportingDataClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL";
export type ReportingFieldRole = "DIMENSION" | "MEASURE";
export type ReportingFieldType = "string" | "number" | "date" | "boolean";
export type ReportingAggregation =
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "count"
  | "distinct_count";

export type ReportingPermissionLevel = "VIEW" | "BUILD";

export type ReportingDatasetPermission = {
  roleTypes: RoleType[];
  level: ReportingPermissionLevel;
};

export type ReportingFieldDefinition = {
  key: string;
  label: string;
  role: ReportingFieldRole;
  type: ReportingFieldType;
  description?: string;
  allowedAggregations?: ReportingAggregation[];
};

export type ReportingDatasetDefinition = {
  datasetId: string;
  datasetName: string;
  description: string;
  owner: string;
  refreshSchedule: string;
  primaryKeys: string[];
  dimensions: ReportingFieldDefinition[];
  measures: ReportingFieldDefinition[];
  allowedAggregations: ReportingAggregation[];
  dataClassification: ReportingDataClassification;
  permissions: ReportingDatasetPermission[];
  sampleQueries: string[];
  updatedAt: string;
};

export type ReportFilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between";

export type ReportFilterValue = string | number | boolean | null | Array<string | number>;

export type ReportFilterDefinition = {
  field: string;
  operator: ReportFilterOperator;
  value: ReportFilterValue;
};

export type ReportSortDirection = "asc" | "desc";

export type ReportSortDefinition = {
  field: string;
  direction: ReportSortDirection;
};

export type ReportValueDefinition = {
  field: string;
  label: string;
  aggregation: ReportingAggregation;
  format?: "number" | "currency" | "percent";
};

export type ReportCalculationType =
  | "ARITHMETIC"
  | "VARIANCE"
  | "VARIANCE_PCT"
  | "MOM"
  | "QOQ"
  | "YOY"
  | "FOF"
  | "ROLLING"
  | "YTD"
  | "IF_CASE"
  | "RANK";

export type ReportCalculationDefinition = {
  id: string;
  name: string;
  type: ReportCalculationType;
  outputField: string;
  expression?: string;
  config?: Record<string, string | number | boolean | null>;
};

export type ReportVisualType =
  | "table"
  | "line"
  | "bar"
  | "stacked_bar"
  | "area"
  | "scatter"
  | "donut"
  | "pie"
  | "kpi"
  | "heatmap";

export type ReportVisualDefinition = {
  id: string;
  title: string;
  type: ReportVisualType;
  xField?: string;
  yField?: string;
  seriesField?: string;
  metricField?: string;
  sortBy?: string;
  sortDirection?: ReportSortDirection;
};

export type ReportParameterType = "date" | "daterange" | "fiscal_year" | "string" | "select";

export type ReportParameterDefinition = {
  id: string;
  label: string;
  type: ReportParameterType;
  required: boolean;
  defaultValue?: string;
  options?: string[];
};

export type ReportViewDefinition = {
  id: string;
  name: string;
  rows: string[];
  columns: string[];
  values: ReportValueDefinition[];
  filters: ReportFilterDefinition[];
  sort: ReportSortDefinition[];
  pageSize: number;
  showTotals: boolean;
  pivotMode: boolean;
  visuals: ReportVisualDefinition[];
};

export type ReportDefinition = {
  name: string;
  description: string;
  datasetIds: string[];
  fiscalCalendarId: string;
  views: ReportViewDefinition[];
  calculations: ReportCalculationDefinition[];
  parameters: ReportParameterDefinition[];
  formatting?: {
    currency?: string;
    decimals?: number;
  };
};

export type ReportAccessControl = {
  ownerUserId: string;
  ownerEmail: string;
  viewers: string[];
  editors: string[];
};

export type ReportVersion = {
  version: number;
  savedAt: string;
  savedByUserId: string;
  savedByEmail: string;
  definition: ReportDefinition;
};

export type SavedReport = {
  id: string;
  type: "REPORT";
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  access: ReportAccessControl;
  definition: ReportDefinition;
  versions: ReportVersion[];
  isFeatured?: boolean;
  sourceTemplateId?: string;
};

export type SavedTemplate = {
  id: string;
  type: "TEMPLATE";
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  access: ReportAccessControl;
  definition: ReportDefinition;
  versions: ReportVersion[];
  isFeatured?: boolean;
};

export type DatasetRegistryStore = {
  datasets: ReportingDatasetDefinition[];
  fiscalCalendars: Array<{
    id: string;
    name: string;
    fiscalYearStartMonth: number;
    description: string;
  }>;
  glossary: Array<{
    term: string;
    definition: string;
  }>;
};

export type ReportsStore = {
  reports: SavedReport[];
};

export type TemplatesStore = {
  templates: SavedTemplate[];
};

export type ReportQueryRunInput = {
  viewId?: string;
  parameters?: Record<string, string>;
  filters?: ReportFilterDefinition[];
  page?: number;
  pageSize?: number;
};

export type ReportTableResult = {
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
  totals: Record<string, number>;
  page: number;
  pageSize: number;
  totalRows: number;
};

export type ReportChartResult = {
  visualId: string;
  title: string;
  type: ReportVisualType;
  data: Array<Record<string, string | number | null>>;
};

export type InsightItem = {
  type: "trend" | "driver" | "anomaly" | "forecast" | "quality";
  title: string;
  detail: string;
};

export type ReportInsights = {
  bullets: InsightItem[];
  executiveSummary: string;
};

export type ReportRunResult = {
  reportId?: string;
  reportTitle: string;
  datasetIds: string[];
  view: ReportViewDefinition;
  appliedFilters: ReportFilterDefinition[];
  appliedParameters: Record<string, string>;
  generatedAt: string;
  table: ReportTableResult;
  charts: ReportChartResult[];
  insights: ReportInsights;
  rawRows: Array<Record<string, string | number | boolean | null>>;
};
