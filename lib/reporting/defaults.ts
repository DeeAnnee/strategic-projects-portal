import type { RoleType } from "@/lib/auth/roles";
import type {
  DatasetRegistryStore,
  ReportDefinition,
  ReportViewDefinition,
  ReportingAggregation,
  ReportingDatasetDefinition,
  SavedReport,
  SavedTemplate,
  TemplatesStore,
  ReportsStore
} from "@/lib/reporting/types";

const allRoles: RoleType[] = [
  "BASIC_USER",
  "FINANCE_GOVERNANCE_USER",
  "PROJECT_GOVERNANCE_USER",
  "SPO_COMMITTEE_HUB_USER",
  "PROJECT_MANAGEMENT_HUB_ADMIN",
  "PROJECT_MANAGEMENT_HUB_BASIC_USER",
  "ADMIN"
];

const privilegedRoles: RoleType[] = [
  "FINANCE_GOVERNANCE_USER",
  "PROJECT_GOVERNANCE_USER",
  "SPO_COMMITTEE_HUB_USER",
  "PROJECT_MANAGEMENT_HUB_ADMIN",
  "PROJECT_MANAGEMENT_HUB_BASIC_USER",
  "ADMIN"
];

const nowIso = () => new Date().toISOString();

const commonDatasetProps = {
  owner: "Enterprise Data Office",
  refreshSchedule: "Hourly",
  allowedAggregations: ["sum", "avg", "min", "max", "count", "distinct_count"] as ReportingAggregation[],
  dataClassification: "INTERNAL" as const,
  permissions: [
    {
      roleTypes: allRoles,
      level: "BUILD" as const
    }
  ],
  sampleQueries: [
    "Compare current fiscal spend to previous fiscal by segment",
    "Show approval aging by stage",
    "List projects at risk with top budget variance"
  ]
};

const mkDataset = (dataset: Omit<ReportingDatasetDefinition, "updatedAt">): ReportingDatasetDefinition => ({
  ...dataset,
  updatedAt: nowIso()
});

export const defaultDatasets = (): ReportingDatasetDefinition[] => [
  mkDataset({
    datasetId: "projects",
    datasetName: "Projects Dataset",
    description: "Core project intake and lifecycle metadata.",
    primaryKeys: ["project_id"],
    dimensions: [
      { key: "project_id", label: "Project ID", role: "DIMENSION", type: "string" },
      { key: "project_name", label: "Project Name", role: "DIMENSION", type: "string" },
      { key: "stage", label: "Stage", role: "DIMENSION", type: "string" },
      { key: "status", label: "Status", role: "DIMENSION", type: "string" },
      { key: "project_theme", label: "Project Theme", role: "DIMENSION", type: "string" },
      { key: "segment_unit", label: "Segment - Unit", role: "DIMENSION", type: "string" },
      { key: "business_unit", label: "Business Unit", role: "DIMENSION", type: "string" },
      { key: "owner_email", label: "Owner Email", role: "DIMENSION", type: "string" },
      { key: "business_sponsor", label: "Business Sponsor", role: "DIMENSION", type: "string" },
      { key: "start_date", label: "Start Date", role: "DIMENSION", type: "date" },
      { key: "end_date", label: "End Date", role: "DIMENSION", type: "date" },
      { key: "fiscal_year", label: "Fiscal Year", role: "DIMENSION", type: "number" }
    ],
    measures: [
      { key: "project_count", label: "Project Count", role: "MEASURE", type: "number", allowedAggregations: ["count", "sum"] },
      { key: "capex", label: "Capex", role: "MEASURE", type: "number" },
      { key: "opex", label: "Expense", role: "MEASURE", type: "number" },
      { key: "one_time_costs", label: "One-Time Costs", role: "MEASURE", type: "number" },
      { key: "total_cost", label: "Total Cost", role: "MEASURE", type: "number" },
      { key: "npv", label: "NPV", role: "MEASURE", type: "number" },
      { key: "payback_years", label: "Payback (Years)", role: "MEASURE", type: "number" }
    ],
    ...commonDatasetProps
  }),
  mkDataset({
    datasetId: "funding_requests",
    datasetName: "Funding Requests Dataset",
    description: "Funding request stage records and economics.",
    primaryKeys: ["project_id"],
    dimensions: [
      { key: "project_id", label: "Project ID", role: "DIMENSION", type: "string" },
      { key: "project_name", label: "Project Name", role: "DIMENSION", type: "string" },
      { key: "status", label: "Status", role: "DIMENSION", type: "string" },
      { key: "funding_status", label: "Funding Status", role: "DIMENSION", type: "string" },
      { key: "segment_unit", label: "Segment - Unit", role: "DIMENSION", type: "string" },
      { key: "owner_email", label: "Owner Email", role: "DIMENSION", type: "string" },
      { key: "submitted_at", label: "Submitted At", role: "DIMENSION", type: "date" },
      { key: "fiscal_year", label: "Fiscal Year", role: "DIMENSION", type: "number" }
    ],
    measures: [
      { key: "request_count", label: "Request Count", role: "MEASURE", type: "number", allowedAggregations: ["count", "sum"] },
      { key: "budget_requested", label: "Budget Requested", role: "MEASURE", type: "number" },
      { key: "budget_approved", label: "Budget Approved", role: "MEASURE", type: "number" },
      { key: "benefits_target", label: "Benefits Target", role: "MEASURE", type: "number" }
    ],
    ...commonDatasetProps
  }),
  mkDataset({
    datasetId: "approvals",
    datasetName: "Approvals Dataset",
    description: "Project approval stages, decisions, and aging.",
    primaryKeys: ["project_id", "approval_stage"],
    dimensions: [
      { key: "project_id", label: "Project ID", role: "DIMENSION", type: "string" },
      { key: "project_name", label: "Project Name", role: "DIMENSION", type: "string" },
      { key: "approval_stage", label: "Approval Stage", role: "DIMENSION", type: "string" },
      { key: "approval_status", label: "Approval Status", role: "DIMENSION", type: "string" },
      { key: "decided_at", label: "Decided At", role: "DIMENSION", type: "date" },
      { key: "fiscal_year", label: "Fiscal Year", role: "DIMENSION", type: "number" }
    ],
    measures: [
      { key: "approval_count", label: "Approval Count", role: "MEASURE", type: "number", allowedAggregations: ["count", "sum"] },
      { key: "approval_age_days", label: "Approval Age Days", role: "MEASURE", type: "number" }
    ],
    ...commonDatasetProps
  }),
  mkDataset({
    datasetId: "governance_tasks",
    datasetName: "Governance Tasks Dataset",
    description: "Finance and Project Governance task board activities.",
    primaryKeys: ["task_id"],
    dimensions: [
      { key: "project_id", label: "Project ID", role: "DIMENSION", type: "string" },
      { key: "project_name", label: "Project Name", role: "DIMENSION", type: "string" },
      { key: "lane", label: "Hub Lane", role: "DIMENSION", type: "string" },
      { key: "task_id", label: "Task ID", role: "DIMENSION", type: "string" },
      { key: "task_title", label: "Task Title", role: "DIMENSION", type: "string" },
      { key: "task_status", label: "Task Status", role: "DIMENSION", type: "string" },
      { key: "assignee_name", label: "Assignee", role: "DIMENSION", type: "string" },
      { key: "due_date", label: "Due Date", role: "DIMENSION", type: "date" },
      { key: "fiscal_year", label: "Fiscal Year", role: "DIMENSION", type: "number" }
    ],
    measures: [
      { key: "task_count", label: "Task Count", role: "MEASURE", type: "number", allowedAggregations: ["count", "sum"] },
      { key: "days_to_due", label: "Days to Due", role: "MEASURE", type: "number" }
    ],
    ...commonDatasetProps
  }),
  mkDataset({
    datasetId: "finance",
    datasetName: "Finance Dataset",
    description: "Financial outcomes by fiscal year and project.",
    primaryKeys: ["project_id", "fiscal_year"],
    dimensions: [
      { key: "project_id", label: "Project ID", role: "DIMENSION", type: "string" },
      { key: "project_name", label: "Project Name", role: "DIMENSION", type: "string" },
      { key: "segment_unit", label: "Segment - Unit", role: "DIMENSION", type: "string" },
      { key: "fiscal_year", label: "Fiscal Year", role: "DIMENSION", type: "number" }
    ],
    measures: [
      { key: "capex", label: "Capex", role: "MEASURE", type: "number" },
      { key: "expense", label: "Expense", role: "MEASURE", type: "number" },
      { key: "total", label: "Total", role: "MEASURE", type: "number" },
      { key: "revenue", label: "Revenue", role: "MEASURE", type: "number" },
      { key: "saved_costs", label: "Saved Costs", role: "MEASURE", type: "number" },
      { key: "additional_operating_costs", label: "Additional Operating Costs", role: "MEASURE", type: "number" },
      { key: "net_benefits", label: "Net Benefits", role: "MEASURE", type: "number" }
    ],
    ...commonDatasetProps
  }),
  mkDataset({
    datasetId: "hr_resources",
    datasetName: "HR / Resources Dataset",
    description: "Resource requirement details from business cases.",
    primaryKeys: ["project_id", "resource_row_id"],
    dimensions: [
      { key: "project_id", label: "Project ID", role: "DIMENSION", type: "string" },
      { key: "project_name", label: "Project Name", role: "DIMENSION", type: "string" },
      { key: "resource_row_id", label: "Resource Row", role: "DIMENSION", type: "string" },
      { key: "role_description", label: "Role Description", role: "DIMENSION", type: "string" },
      { key: "resource_type", label: "Resource Type", role: "DIMENSION", type: "string" },
      { key: "pay_grade", label: "Pay Grade", role: "DIMENSION", type: "string" },
      { key: "hiring_required", label: "Hiring Required", role: "DIMENSION", type: "string" },
      { key: "resource_start_date", label: "Resource Start Date", role: "DIMENSION", type: "date" },
      { key: "resource_end_date", label: "Resource End Date", role: "DIMENSION", type: "date" },
      { key: "fiscal_year", label: "Fiscal Year", role: "DIMENSION", type: "number" }
    ],
    measures: [
      { key: "resource_count", label: "Resource Count", role: "MEASURE", type: "number", allowedAggregations: ["count", "sum"] },
      { key: "allocation_pct", label: "Allocation %", role: "MEASURE", type: "number" }
    ],
    ...commonDatasetProps,
    permissions: [{ roleTypes: privilegedRoles, level: "BUILD" }]
  }),
  mkDataset({
    datasetId: "audit_status_events",
    datasetName: "Audit / Status Events Dataset",
    description: "Submission audit timeline and workflow events.",
    primaryKeys: ["event_id"],
    dimensions: [
      { key: "event_id", label: "Event ID", role: "DIMENSION", type: "string" },
      { key: "project_id", label: "Project ID", role: "DIMENSION", type: "string" },
      { key: "project_name", label: "Project Name", role: "DIMENSION", type: "string" },
      { key: "event_action", label: "Action", role: "DIMENSION", type: "string" },
      { key: "event_stage", label: "Stage", role: "DIMENSION", type: "string" },
      { key: "event_status", label: "Status", role: "DIMENSION", type: "string" },
      { key: "actor_email", label: "Actor Email", role: "DIMENSION", type: "string" },
      { key: "event_timestamp", label: "Event Timestamp", role: "DIMENSION", type: "date" },
      { key: "fiscal_year", label: "Fiscal Year", role: "DIMENSION", type: "number" }
    ],
    measures: [
      { key: "event_count", label: "Event Count", role: "MEASURE", type: "number", allowedAggregations: ["count", "sum"] }
    ],
    ...commonDatasetProps,
    permissions: [{ roleTypes: privilegedRoles, level: "BUILD" }]
  })
];

const mkDefaultView = (
  id: string,
  name: string,
  rows: string[],
  values: Array<{ field: string; label: string; aggregation: "sum" | "avg" | "min" | "max" | "count" | "distinct_count"; format?: "number" | "currency" | "percent" }>,
  visuals: ReportViewDefinition["visuals"]
): ReportViewDefinition => ({
  id,
  name,
  rows,
  columns: [],
  values,
  filters: [],
  sort: [],
  pageSize: 25,
  showTotals: true,
  pivotMode: true,
  visuals
});

const mkDefinition = (args: {
  name: string;
  description: string;
  datasetIds: string[];
  view: ReportViewDefinition;
  parameters?: ReportDefinition["parameters"];
  calculations?: ReportDefinition["calculations"];
}): ReportDefinition => ({
  name: args.name,
  description: args.description,
  datasetIds: args.datasetIds,
  fiscalCalendarId: "org_default",
  views: [args.view],
  calculations: args.calculations ?? [],
  parameters:
    args.parameters ?? [
      { id: "fiscal_year", label: "Fiscal Year", type: "fiscal_year", required: false },
      { id: "segment_unit", label: "Segment - Unit", type: "string", required: false },
      { id: "status", label: "Status", type: "string", required: false }
    ],
  formatting: {
    currency: "USD",
    decimals: 2
  }
});

const mkAccess = () => ({
  ownerUserId: "u-admin-001",
  ownerEmail: "admin@portal.local",
  viewers: [],
  editors: []
});

const mkReport = (args: {
  id: string;
  title: string;
  description: string;
  tags: string[];
  definition: ReportDefinition;
  isFeatured?: boolean;
  sourceTemplateId?: string;
}): SavedReport => {
  const createdAt = nowIso();
  return {
    id: args.id,
    type: "REPORT",
    title: args.title,
    description: args.description,
    tags: args.tags,
    createdAt,
    updatedAt: createdAt,
    access: mkAccess(),
    definition: args.definition,
    versions: [
      {
        version: 1,
        savedAt: createdAt,
        savedByUserId: "u-admin-001",
        savedByEmail: "admin@portal.local",
        definition: args.definition
      }
    ],
    isFeatured: args.isFeatured,
    sourceTemplateId: args.sourceTemplateId
  };
};

const mkTemplate = (args: {
  id: string;
  title: string;
  description: string;
  tags: string[];
  definition: ReportDefinition;
  isFeatured?: boolean;
}): SavedTemplate => {
  const createdAt = nowIso();
  return {
    id: args.id,
    type: "TEMPLATE",
    title: args.title,
    description: args.description,
    tags: args.tags,
    createdAt,
    updatedAt: createdAt,
    access: mkAccess(),
    definition: args.definition,
    versions: [
      {
        version: 1,
        savedAt: createdAt,
        savedByUserId: "u-admin-001",
        savedByEmail: "admin@portal.local",
        definition: args.definition
      }
    ],
    isFeatured: args.isFeatured
  };
};

const sampleDefinitions = () => {
  const portfolioSummary = mkDefinition({
    name: "Portfolio Summary (Stage / Status / Health)",
    description: "Portfolio counts and financial posture grouped by stage and status.",
    datasetIds: ["projects"],
    view: mkDefaultView(
      "overview",
      "Portfolio Overview",
      ["stage", "status"],
      [
        { field: "project_count", label: "Projects", aggregation: "sum" },
        { field: "total_cost", label: "Total Cost", aggregation: "sum", format: "currency" },
        { field: "npv", label: "NPV", aggregation: "sum", format: "currency" }
      ],
      [
        { id: "chart-stage", title: "Projects by Stage", type: "bar", xField: "stage", yField: "Projects" },
        { id: "chart-status", title: "Projects by Status", type: "donut", xField: "status", yField: "Projects" }
      ]
    )
  });

  const approvalSla = mkDefinition({
    name: "Approval SLA Breaches",
    description: "Approval aging and trend by approval stage.",
    datasetIds: ["approvals"],
    view: mkDefaultView(
      "sla",
      "SLA Breaches",
      ["approval_stage", "approval_status"],
      [
        { field: "approval_count", label: "Approvals", aggregation: "sum" },
        { field: "approval_age_days", label: "Avg Age Days", aggregation: "avg", format: "number" }
      ],
      [
        { id: "chart-aging", title: "Approval Aging", type: "stacked_bar", xField: "approval_stage", yField: "Avg Age Days" },
        { id: "chart-throughput", title: "Approval Throughput", type: "line", xField: "approval_stage", yField: "Approvals" }
      ]
    )
  });

  const fofSpend = mkDefinition({
    name: "Fiscal-over-Fiscal Spend vs Budget",
    description: "FoF variance analysis for spend and budget.",
    datasetIds: ["finance"],
    view: mkDefaultView(
      "fof",
      "FoF Spend vs Budget",
      ["fiscal_year", "segment_unit"],
      [
        { field: "total", label: "Total Spend", aggregation: "sum", format: "currency" },
        { field: "capex", label: "Capex", aggregation: "sum", format: "currency" },
        { field: "expense", label: "Expense", aggregation: "sum", format: "currency" }
      ],
      [
        { id: "chart-fof", title: "Spend Trend", type: "line", xField: "fiscal_year", yField: "Total Spend" },
        { id: "chart-segment", title: "Spend by Segment", type: "bar", xField: "segment_unit", yField: "Total Spend" }
      ]
    ),
    calculations: [
      {
        id: "calc-fof-variance",
        name: "FoF Variance",
        type: "FOF",
        outputField: "fof_variance",
        config: { baseField: "Total Spend" }
      }
    ]
  });

  const benefitsRealization = mkDefinition({
    name: "Benefits Realization vs Target",
    description: "Net benefits trend and variance.",
    datasetIds: ["finance", "funding_requests"],
    view: mkDefaultView(
      "benefits",
      "Benefits",
      ["project_id", "fiscal_year"],
      [
        { field: "net_benefits", label: "Net Benefits", aggregation: "sum", format: "currency" },
        { field: "benefits_target", label: "Benefits Target", aggregation: "sum", format: "currency" }
      ],
      [
        { id: "chart-benefit-trend", title: "Benefit Trend", type: "line", xField: "fiscal_year", yField: "Net Benefits" },
        { id: "chart-benefit-gap", title: "Benefit Gap", type: "bar", xField: "project_id", yField: "Benefits Target" }
      ]
    ),
    calculations: [
      {
        id: "calc-benefit-variance",
        name: "Benefit Variance",
        type: "VARIANCE",
        outputField: "benefit_variance",
        config: {
          minuendField: "Net Benefits",
          subtrahendField: "Benefits Target"
        }
      }
    ]
  });

  const pmWorkload = mkDefinition({
    name: "PM Workload & Overdue Tasks",
    description: "Governance workload by assignee and task status.",
    datasetIds: ["governance_tasks"],
    view: mkDefaultView(
      "workload",
      "Workload",
      ["assignee_name", "task_status"],
      [
        { field: "task_count", label: "Tasks", aggregation: "sum" },
        { field: "days_to_due", label: "Avg Days to Due", aggregation: "avg", format: "number" }
      ],
      [
        { id: "chart-workload", title: "Task Load", type: "bar", xField: "assignee_name", yField: "Tasks" },
        { id: "chart-overdue", title: "Overdue Mix", type: "donut", xField: "task_status", yField: "Tasks" }
      ]
    )
  });

  const governanceBottlenecks = mkDefinition({
    name: "Governance Bottlenecks",
    description: "Contribution analysis by stage and event flow.",
    datasetIds: ["audit_status_events"],
    view: mkDefaultView(
      "bottlenecks",
      "Bottlenecks",
      ["event_stage", "event_action"],
      [{ field: "event_count", label: "Events", aggregation: "sum" }],
      [
        { id: "chart-stage-delay", title: "Stage Throughput", type: "stacked_bar", xField: "event_stage", yField: "Events" },
        { id: "chart-action", title: "Action Distribution", type: "pie", xField: "event_action", yField: "Events" }
      ]
    )
  });

  return {
    portfolioSummary,
    approvalSla,
    fofSpend,
    benefitsRealization,
    pmWorkload,
    governanceBottlenecks
  };
};

export const defaultReportsStore = (): ReportsStore => {
  const defs = sampleDefinitions();
  return {
    reports: [
      mkReport({
        id: "report-portfolio-summary",
        title: "Portfolio Summary (Stage/Status/Health)",
        description: "Enterprise portfolio summary with stage and status rollups.",
        tags: ["portfolio", "executive"],
        definition: defs.portfolioSummary,
        isFeatured: true
      }),
      mkReport({
        id: "report-approval-sla",
        title: "Approval SLA Breaches",
        description: "Approval aging and throughput trends.",
        tags: ["governance", "sla"],
        definition: defs.approvalSla,
        isFeatured: true
      }),
      mkReport({
        id: "report-fof-spend",
        title: "Fiscal-over-Fiscal Spend vs Budget",
        description: "FoF spend and budget variance analysis.",
        tags: ["finance", "fiscal"],
        definition: defs.fofSpend,
        isFeatured: true
      }),
      mkReport({
        id: "report-benefits",
        title: "Benefits Realization vs Target",
        description: "Benefits trend against targets.",
        tags: ["benefits", "value"],
        definition: defs.benefitsRealization
      }),
      mkReport({
        id: "report-pm-workload",
        title: "PM Workload & Overdue Tasks",
        description: "Task load by owner and due-date health.",
        tags: ["resources", "workload"],
        definition: defs.pmWorkload
      }),
      mkReport({
        id: "report-governance-bottlenecks",
        title: "Governance Bottlenecks",
        description: "Workflow bottleneck and contribution view.",
        tags: ["governance", "throughput"],
        definition: defs.governanceBottlenecks
      })
    ]
  };
};

export const defaultTemplatesStore = (): TemplatesStore => {
  const defs = sampleDefinitions();
  return {
    templates: [
      mkTemplate({
        id: "template-portfolio",
        title: "Executive Portfolio Template",
        description: "Executive template for portfolio rollups and board packs.",
        tags: ["executive", "featured"],
        definition: defs.portfolioSummary,
        isFeatured: true
      }),
      mkTemplate({
        id: "template-sla",
        title: "Governance SLA Template",
        description: "Template for SLA aging, throughput, and bottlenecks.",
        tags: ["sla", "governance"],
        definition: defs.approvalSla,
        isFeatured: true
      }),
      mkTemplate({
        id: "template-finance",
        title: "Finance Variance Template",
        description: "Template for FoF spend and benefits variance tracking.",
        tags: ["finance", "featured"],
        definition: defs.fofSpend,
        isFeatured: true
      })
    ]
  };
};

export const defaultDatasetRegistryStore = (): DatasetRegistryStore => ({
  datasets: defaultDatasets(),
  fiscalCalendars: [
    {
      id: "global_jan",
      name: "Global Fiscal Calendar (Jan-Dec)",
      fiscalYearStartMonth: 1,
      description: "Fiscal year starts January 1."
    },
    {
      id: "org_default",
      name: "Organization Fiscal Calendar (Nov-Oct)",
      fiscalYearStartMonth: 11,
      description: "Fiscal year starts November 1 and ends October 31."
    }
  ],
  glossary: [
    {
      term: "FoF",
      definition: "Fiscal-over-fiscal comparison of a metric against prior fiscal year."
    },
    {
      term: "SLA breach",
      definition: "A workflow duration that exceeds the configured governance target threshold."
    },
    {
      term: "Net Benefits",
      definition: "Revenue + Saved Costs - Additional Operating Costs - Depreciation where applicable."
    }
  ]
});
