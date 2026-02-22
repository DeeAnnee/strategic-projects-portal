import { listBoardCards } from "@/lib/operations/store";
import type { ProjectContextInjection } from "@/lib/copilot/prompts";
import type { CopilotCitation } from "@/lib/copilot/types";
import { getSubmissionById } from "@/lib/submissions/store";
import type { ProjectSubmission } from "@/lib/submissions/types";

export type ProjectContextPack = {
  submission: ProjectSubmission | null;
  projectContext: ProjectContextInjection | null;
  contextText: string;
  citations: CopilotCitation[];
  warnings: string[];
};

const truncate = (value: string, max = 2000) =>
  value.length <= max ? value : `${value.slice(0, max)}...`;

const asUnknown = (value?: string | null) => {
  const normalized = (value ?? "").trim();
  return normalized || "Unknown";
};

const asUnknownArray = (values: Array<string | null | undefined>) => {
  const normalized = values
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : ["Unknown"];
};

export const buildConversationTitle = (message: string) => {
  const compact = message.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "New Copilot Conversation";
  }
  return compact.length <= 72 ? compact : `${compact.slice(0, 69)}...`;
};

const buildBudget = (submission: ProjectSubmission) => {
  const capex = submission.financials.capex ?? 0;
  const opex = submission.financials.opex ?? 0;
  const oneTimeCosts = submission.financials.oneTimeCosts ?? 0;

  return {
    capex,
    opex,
    one_time_costs: oneTimeCosts,
    run_rate_savings: submission.financials.runRateSavings ?? 0,
    payback_months: submission.financials.paybackMonths ?? "Unknown",
    npv: submission.financials.npv ?? "Unknown",
    irr: submission.financials.irr ?? "Unknown",
    total_estimated_cost: capex + opex + oneTimeCosts
  };
};

const buildBusinessCaseSummary = (submission: ProjectSubmission) => ({
  summary: truncate(submission.summary || "Unknown", 900),
  project_description: asUnknown(
    submission.businessCase?.projectOverview?.projectDescription || submission.summary
  ),
  financial_benefits_and_assumptions: asUnknown(
    submission.businessCase?.projectOverview?.opportunityStatement ||
      submission.benefits.financialAssumptions
  ),
  intangible_benefits_and_assumptions: asUnknown(
    submission.businessCase?.benefitRealizationPlan?.nonFinancialBenefitsSummary ||
      submission.benefits.intangibleAssumptions
  ),
  funding_type: asUnknown(submission.businessCase?.introduction?.fundingType),
  funding_source: asUnknown(submission.businessCase?.introduction?.fundingSource)
});

const collectDeliverables = (submission: ProjectSubmission) =>
  asUnknownArray([
    submission.businessCase?.benefitRealizationPlan?.deliverable1,
    submission.businessCase?.benefitRealizationPlan?.deliverable2,
    submission.businessCase?.benefitRealizationPlan?.deliverable3,
    submission.businessCase?.benefitRealizationPlan?.additionalPostProjectDeliverables
  ]);

const collectConstraints = (submission: ProjectSubmission) =>
  asUnknownArray([
    submission.businessCase?.strategyAlignment?.keyDependencies,
    submission.businessCase?.riskMitigation?.highMediumInherentRisk,
    submission.businessCase?.approvals?.requiredStakeholderApprovals
  ]);

const collectStakeholders = (submission: ProjectSubmission) => {
  const assignmentStakeholders = (submission.assignments ?? [])
    .map((assignment) => assignment.userEmail || assignment.userId)
    .filter((value): value is string => Boolean(value));

  return asUnknownArray([
    submission.ownerName,
    submission.businessSponsor,
    submission.businessDelegate,
    submission.technologySponsor,
    submission.financeSponsor,
    submission.benefitsSponsor,
    ...assignmentStakeholders
  ]);
};

const collectWarnings = (context: ProjectContextInjection) => {
  const warnings: string[] = [];
  if (context.timeline_start === "Unknown") {
    warnings.push("Timeline start is Unknown in project context.");
  }
  if (context.timeline_end === "Unknown") {
    warnings.push("Timeline end is Unknown in project context.");
  }
  if (context.deliverables.includes("Unknown")) {
    warnings.push("Deliverables are incomplete in project context.");
  }
  if (context.stakeholders.includes("Unknown")) {
    warnings.push("Stakeholder list is incomplete in project context.");
  }
  return warnings;
};

const buildAuthoritativeProjectContext = (
  submission: ProjectSubmission
): ProjectContextInjection => ({
  project_id: submission.id,
  project_title: asUnknown(submission.title),
  business_case: buildBusinessCaseSummary(submission),
  sponsor: asUnknown(submission.businessSponsor || submission.sponsorName),
  department: asUnknown(submission.segmentUnit || submission.businessUnit),
  strategic_alignment_tags: asUnknownArray([
    submission.projectTheme,
    submission.strategicObjective,
    submission.enterpriseProjectTheme,
    submission.portfolioEsc
  ]),
  budget: buildBudget(submission),
  timeline_start: asUnknown(submission.startDate),
  timeline_end: asUnknown(submission.endDate),
  status: `${asUnknown(submission.stage)} | ${asUnknown(submission.status)}`,
  deliverables: collectDeliverables(submission),
  constraints: collectConstraints(submission),
  dependencies: asUnknownArray(submission.dependencies),
  stakeholders: collectStakeholders(submission)
});

export const buildProjectContextPack = async (projectId?: string): Promise<ProjectContextPack> => {
  if (!projectId) {
    return {
      submission: null,
      projectContext: null,
      contextText: "",
      citations: [],
      warnings: []
    };
  }

  const submission = await getSubmissionById(projectId);
  if (!submission) {
    return {
      submission: null,
      projectContext: null,
      contextText: "",
      citations: [
        {
          source: "Portal Project Store",
          label: projectId,
          detail: "Project not found"
        }
      ],
      warnings: ["Project context is unavailable because the project was not found."]
    };
  }

  const boardRows = await listBoardCards();
  const linkedCards = boardRows
    .filter((row) => row.projectId === projectId)
    .map((row) => ({
      lane: row.lane,
      stage: row.stage,
      status: row.status,
      tasks: row.tasks.map((task) => ({
        title: task.title,
        status: task.status,
        dueDate: task.dueDate,
        assigneeName: task.assigneeName
      }))
    }));

  const projectContext = buildAuthoritativeProjectContext(submission);

  const contextPayload = {
    project_context: projectContext,
    governance_board: linkedCards
  };

  const citations: CopilotCitation[] = [
    {
      source: "Portal Project Store",
      label: `${submission.id} - ${submission.title}`,
      detail: `${submission.stage} / ${submission.status}`,
      fields: [
        "title",
        "summary",
        "stage",
        "status",
        "owner",
        "sponsor",
        "financials",
        "dependencies",
        "businessCase"
      ]
    }
  ];

  if (linkedCards.length > 0) {
    citations.push({
      source: "Governance Hubs",
      label: `${linkedCards.length} governance card(s)`,
      detail: linkedCards.map((card) => `${card.lane}: ${card.tasks.length} task(s)`).join(" | "),
      fields: ["lane", "tasks", "dueDate", "assigneeName"]
    });
  }

  return {
    submission,
    projectContext,
    contextText: JSON.stringify(contextPayload, null, 2),
    citations,
    warnings: collectWarnings(projectContext)
  };
};

