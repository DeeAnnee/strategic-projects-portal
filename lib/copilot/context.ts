import { listBoardCards } from "@/lib/operations/store";
import { resolveSponsorEmail } from "@/lib/submissions/sponsor-contact";
import { getSubmissionById } from "@/lib/submissions/store";
import type { ProjectSubmission } from "@/lib/submissions/types";
import type { CopilotCitation } from "@/lib/copilot/types";

export type ProjectContextPack = {
  submission: ProjectSubmission | null;
  contextText: string;
  citations: CopilotCitation[];
};

const truncate = (value: string, max = 2000) =>
  value.length <= max ? value : `${value.slice(0, max)}...`;

export const buildConversationTitle = (message: string) => {
  const compact = message.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "New Copilot Conversation";
  }
  return compact.length <= 72 ? compact : `${compact.slice(0, 69)}...`;
};

const formatSubmissionContext = (submission: ProjectSubmission) => {
  const sponsorEmail = resolveSponsorEmail(
    submission.businessSponsor || submission.sponsorName,
    submission.sponsorEmail
  );

  return {
    projectId: submission.id,
    projectName: submission.title,
    summary: truncate(submission.summary || "", 900),
    stage: submission.stage,
    status: submission.status,
    requestType: submission.requestType,
    owner: {
      name: submission.ownerName,
      email: submission.ownerEmail
    },
    sponsor: {
      name: submission.businessSponsor || submission.sponsorName,
      email: sponsorEmail
    },
    timeline: {
      startDate: submission.startDate ?? null,
      endDate: submission.endDate ?? null,
      targetGoLive: submission.targetGoLive ?? null,
      dueDate: submission.dueDate ?? null
    },
    financials: {
      capex: submission.financials.capex,
      opex: submission.financials.opex,
      oneTimeCosts: submission.financials.oneTimeCosts,
      runRateSavings: submission.financials.runRateSavings,
      paybackMonths: submission.financials.paybackMonths,
      npv: submission.financials.npv ?? null,
      irr: submission.financials.irr ?? null
    },
    lastUpdated: submission.updatedAt,
    dependencies: submission.dependencies
  };
};

export const buildProjectContextPack = async (projectId?: string): Promise<ProjectContextPack> => {
  if (!projectId) {
    return { submission: null, contextText: "", citations: [] };
  }

  const submission = await getSubmissionById(projectId);
  if (!submission) {
    return {
      submission: null,
      contextText: "",
      citations: [
        {
          source: "Portal Project Store",
          label: projectId,
          detail: "Project not found"
        }
      ]
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

  const contextPayload = {
    project: formatSubmissionContext(submission),
    governanceBoard: linkedCards
  };

  const citations: CopilotCitation[] = [
    {
      source: "Portal Project Store",
      label: `${submission.id} - ${submission.title}`,
      detail: `${submission.stage} / ${submission.status}`,
      fields: ["title", "summary", "stage", "status", "owner", "sponsor", "financials", "dependencies"]
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
    contextText: JSON.stringify(contextPayload, null, 2),
    citations
  };
};
