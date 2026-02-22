import type { ApiPrincipal } from "@/lib/auth/api";
import { filterSubmissionsByAccess } from "@/lib/auth/project-access";
import { toRbacPrincipal } from "@/lib/auth/api";
import { listBoardCards } from "@/lib/operations/store";
import { listSubmissions } from "@/lib/submissions/store";
import type { ProjectSubmission } from "@/lib/submissions/types";

export type ReportingDataValue = string | number | boolean | null;
export type ReportingDataRow = Record<string, ReportingDataValue>;

const normalizeDate = (value?: string) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const toDateValue = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const defaultFinancialGrid = () => {
  const year = new Date().getFullYear();
  return {
    commencementFiscalYear: year,
    investment: {
      hardware: { priorYears: 0, currentFiscal: 0, future: 0 },
      software: { priorYears: 0, currentFiscal: 0, future: 0 },
      consultancyVendor: { priorYears: 0, currentFiscal: 0, future: 0 },
      premisesRealEstate: { priorYears: 0, currentFiscal: 0, future: 0 },
      otherCapital: { priorYears: 0, currentFiscal: 0, future: 0 },
      expenses: { priorYears: 0, currentFiscal: 0, future: 0 }
    },
    incremental: {
      years: [year + 1, year + 2, year + 3, year + 4, year + 5],
      revenue: [0, 0, 0, 0, 0],
      savedCosts: [0, 0, 0, 0, 0],
      addlOperatingCosts: [0, 0, 0, 0, 0]
    }
  };
};

const daysBetween = (from?: string, to?: string) => {
  const fromDate = toDateValue(from);
  const toDate = toDateValue(to);
  if (!fromDate || !toDate) return 0;
  const diff = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
  return Number.isFinite(diff) ? diff : 0;
};

const resolveFiscalYear = (isoDate: string | undefined, fiscalStartMonth: number) => {
  if (!isoDate) {
    return new Date().getFullYear();
  }
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().getFullYear();
  }
  const month = parsed.getUTCMonth() + 1;
  const year = parsed.getUTCFullYear();
  if (month >= fiscalStartMonth) {
    return year + (fiscalStartMonth === 1 ? 0 : 1);
  }
  return year;
};

const baseSubmissionRow = (submission: ProjectSubmission, fiscalStartMonth: number): ReportingDataRow => {
  const fiscalYear = resolveFiscalYear(submission.startDate, fiscalStartMonth);
  const capex = toNumber(submission.financials?.capex);
  const opex = toNumber(submission.financials?.opex);
  const oneTimeCosts = toNumber(submission.financials?.oneTimeCosts);

  return {
    dataset_id: "projects",
    project_id: submission.id,
    project_name: submission.title,
    stage: submission.stage,
    status: submission.status,
    project_theme: submission.projectTheme ?? "",
    strategic_objective: submission.strategicObjective ?? "",
    segment_unit: submission.segmentUnit ?? "",
    business_unit: submission.businessUnit ?? "",
    owner_email: submission.ownerEmail,
    business_sponsor: submission.businessSponsor || submission.sponsorName || "",
    start_date: normalizeDate(submission.startDate),
    end_date: normalizeDate(submission.endDate),
    fiscal_year: fiscalYear,
    project_count: 1,
    capex,
    opex,
    one_time_costs: oneTimeCosts,
    total_cost: capex + opex + oneTimeCosts,
    npv: toNumber(submission.financials?.npv),
    payback_years: toNumber(submission.financials?.paybackYears),
    irr: toNumber(submission.financials?.irr)
  };
};

const mapProjectsDataset = (submissions: ProjectSubmission[], fiscalStartMonth: number): ReportingDataRow[] =>
  submissions.map((submission) => baseSubmissionRow(submission, fiscalStartMonth));

const mapFundingRequestsDataset = (submissions: ProjectSubmission[], fiscalStartMonth: number): ReportingDataRow[] =>
  submissions
    .filter(
      (submission) =>
        submission.stage === "Funding Request" || submission.workflow.entityType === "FUNDING_REQUEST"
    )
    .map((submission) => {
      const fiscalYear = resolveFiscalYear(submission.startDate, fiscalStartMonth);
      const budgetRequested = toNumber(submission.financials?.capex) + toNumber(submission.financials?.opex);
      const budgetApproved = submission.status === "Approved" ? budgetRequested : budgetRequested * 0.85;

      return {
        dataset_id: "funding_requests",
        project_id: submission.id,
        project_name: submission.title,
        status: submission.status,
        funding_status: submission.workflow.fundingStatus,
        segment_unit: submission.segmentUnit ?? "",
        owner_email: submission.ownerEmail,
        submitted_at: normalizeDate(submission.workflow.lastSavedAt || submission.updatedAt),
        fiscal_year: fiscalYear,
        request_count: 1,
        budget_requested: budgetRequested,
        budget_approved: budgetApproved,
        benefits_target: toNumber(submission.benefits.costSaveEst) + toNumber(submission.benefits.revenueUpliftEst)
      };
    });

const mapApprovalsDataset = (submissions: ProjectSubmission[], fiscalStartMonth: number): ReportingDataRow[] => {
  const now = new Date().toISOString();
  const rows: ReportingDataRow[] = [];

  submissions.forEach((submission) => {
    const stages = submission.approvalStages ?? [];
    if (stages.length === 0) {
      rows.push({
        dataset_id: "approvals",
        project_id: submission.id,
        project_name: submission.title,
        approval_stage: "BUSINESS",
        approval_status: submission.workflow.sponsorDecision === "Approved" ? "APPROVED" : "PENDING",
        decided_at: normalizeDate(submission.workflow.lastSavedAt),
        fiscal_year: resolveFiscalYear(submission.startDate, fiscalStartMonth),
        approval_count: 1,
        approval_age_days: daysBetween(submission.workflow.lastSavedAt, now)
      });
      return;
    }

    stages.forEach((stage) => {
      const createdAt = stage.createdAt || submission.createdAt;
      const decidedAt = stage.decidedAt || stage.updatedAt || now;
      rows.push({
        dataset_id: "approvals",
        project_id: submission.id,
        project_name: submission.title,
        approval_stage: stage.stage,
        approval_status: stage.status,
        decided_at: normalizeDate(decidedAt),
        fiscal_year: resolveFiscalYear(submission.startDate, fiscalStartMonth),
        approval_count: 1,
        approval_age_days: daysBetween(createdAt, decidedAt)
      });
    });
  });

  return rows;
};

const mapGovernanceTasksDataset = async (
  _submissionsById: Map<string, ProjectSubmission>,
  fiscalStartMonth: number
): Promise<ReportingDataRow[]> => {
  const cards = await listBoardCards();
  const today = new Date().toISOString().slice(0, 10);

  return cards.flatMap((card) =>
    card.tasks.map((task) => {
      const dueDate = normalizeDate(task.dueDate);
      return {
        dataset_id: "governance_tasks",
        project_id: card.projectId,
        project_name: card.projectTitle,
        lane: card.lane,
        task_id: task.id,
        task_title: task.title,
        task_status: task.status,
        assignee_name: task.assigneeName,
        due_date: dueDate,
        fiscal_year: resolveFiscalYear(dueDate, fiscalStartMonth),
        task_count: 1,
        days_to_due: daysBetween(today, dueDate)
      };
    })
  );
};

const mapFinanceDataset = (submissions: ProjectSubmission[], fiscalStartMonth: number): ReportingDataRow[] => {
  const rows: ReportingDataRow[] = [];

  submissions.forEach((submission) => {
    const grid = submission.financialGrid ?? defaultFinancialGrid();
    const years = grid.incremental.years;

    years.forEach((year, index) => {
      const revenue = toNumber(grid.incremental.revenue[index]);
      const savedCosts = toNumber(grid.incremental.savedCosts[index]);
      const addlCosts = toNumber(grid.incremental.addlOperatingCosts[index]);
      const capex = toNumber(submission.financials.capex);
      const expense = toNumber(submission.financials.opex) + toNumber(submission.financials.oneTimeCosts);

      rows.push({
        dataset_id: "finance",
        project_id: submission.id,
        project_name: submission.title,
        segment_unit: submission.segmentUnit ?? "",
        fiscal_year: year,
        capex,
        expense,
        total: capex + expense,
        revenue,
        saved_costs: savedCosts,
        additional_operating_costs: addlCosts,
        net_benefits: revenue + savedCosts - addlCosts
      });
    });

    if (years.length === 0) {
      const fiscalYear = resolveFiscalYear(submission.startDate, fiscalStartMonth);
      const capex = toNumber(submission.financials.capex);
      const expense = toNumber(submission.financials.opex) + toNumber(submission.financials.oneTimeCosts);
      rows.push({
        dataset_id: "finance",
        project_id: submission.id,
        project_name: submission.title,
        segment_unit: submission.segmentUnit ?? "",
        fiscal_year: fiscalYear,
        capex,
        expense,
        total: capex + expense,
        revenue: 0,
        saved_costs: 0,
        additional_operating_costs: 0,
        net_benefits: 0
      });
    }
  });

  return rows;
};

const mapHrResourcesDataset = (submissions: ProjectSubmission[], fiscalStartMonth: number): ReportingDataRow[] => {
  const rows: ReportingDataRow[] = [];

  submissions.forEach((submission) => {
    const resourceRows = submission.businessCase?.resourceRequirements?.humanResources ?? [];
    resourceRows.forEach((resource) => {
      const startDate = normalizeDate(resource.resourceStartDate || submission.startDate);
      const endDate = normalizeDate(resource.resourceEndDate || submission.endDate);
      rows.push({
        dataset_id: "hr_resources",
        project_id: submission.id,
        project_name: submission.title,
        resource_row_id: resource.id,
        role_description: resource.roleDescription,
        resource_type: resource.resourceType,
        pay_grade: resource.payGrade,
        hiring_required: resource.hiringRequired,
        resource_start_date: startDate,
        resource_end_date: endDate,
        fiscal_year: resolveFiscalYear(startDate, fiscalStartMonth),
        resource_count: 1,
        allocation_pct: toNumber(resource.averageAllocationPct)
      });
    });
  });

  return rows;
};

const mapAuditStatusEventsDataset = (submissions: ProjectSubmission[], fiscalStartMonth: number): ReportingDataRow[] =>
  submissions.flatMap((submission) =>
    (submission.auditTrail ?? []).map((event) => {
      const timestamp = normalizeDate(event.createdAt);
      return {
        dataset_id: "audit_status_events",
        event_id: event.id,
        project_id: submission.id,
        project_name: submission.title,
        event_action: event.action,
        event_stage: event.stage,
        event_status: event.status,
        actor_email: event.actorEmail ?? "",
        event_timestamp: timestamp,
        fiscal_year: resolveFiscalYear(timestamp, fiscalStartMonth),
        event_count: 1
      };
    })
  );

export const loadDatasetRowsForPrincipal = async (
  principal: ApiPrincipal,
  datasetId: string,
  fiscalStartMonth: number
): Promise<ReportingDataRow[]> => {
  const visibleSubmissions = filterSubmissionsByAccess(
    toRbacPrincipal(principal),
    await listSubmissions(),
    "dashboard"
  );
  const submissionsById = new Map(visibleSubmissions.map((submission) => [submission.id, submission]));

  switch (datasetId) {
    case "projects":
      return mapProjectsDataset(visibleSubmissions, fiscalStartMonth);
    case "funding_requests":
      return mapFundingRequestsDataset(visibleSubmissions, fiscalStartMonth);
    case "approvals":
      return mapApprovalsDataset(visibleSubmissions, fiscalStartMonth);
    case "governance_tasks":
      return mapGovernanceTasksDataset(submissionsById, fiscalStartMonth);
    case "finance":
      return mapFinanceDataset(visibleSubmissions, fiscalStartMonth);
    case "hr_resources":
      return mapHrResourcesDataset(visibleSubmissions, fiscalStartMonth);
    case "audit_status_events":
      return mapAuditStatusEventsDataset(visibleSubmissions, fiscalStartMonth);
    default:
      return [];
  }
};

const mergeRowsByProject = (rows: ReportingDataRow[]): ReportingDataRow[] => {
  const grouped = new Map<string, ReportingDataRow>();

  rows.forEach((row, index) => {
    const projectId = typeof row.project_id === "string" ? row.project_id : "";
    const rowKey = projectId || `${row.dataset_id ?? "dataset"}-${index}`;
    const existing = grouped.get(rowKey);

    if (!existing) {
      grouped.set(rowKey, { ...row });
      return;
    }

    Object.entries(row).forEach(([key, value]) => {
      if (!(key in existing) || existing[key] === "" || existing[key] === null) {
        existing[key] = value;
      } else if (typeof existing[key] === "number" && typeof value === "number") {
        existing[key] = (existing[key] as number) + value;
      }
    });
  });

  return Array.from(grouped.values());
};

export const loadCombinedDatasetRowsForPrincipal = async (
  principal: ApiPrincipal,
  datasetIds: string[],
  fiscalStartMonth: number
): Promise<ReportingDataRow[]> => {
  const slices = await Promise.all(
    datasetIds.map((datasetId) => loadDatasetRowsForPrincipal(principal, datasetId, fiscalStartMonth))
  );

  const combined = slices.flatMap((rows) => rows);
  if (datasetIds.length <= 1) {
    return combined;
  }

  return mergeRowsByProject(combined);
};
