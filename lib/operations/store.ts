import { promises as fs } from "node:fs";
import path from "node:path";

import { addNotification } from "@/lib/notifications/store";
import { listSubmissions, reconcileSubmissionWorkflow } from "@/lib/submissions/store";
import { resolveWorkflowLifecycleStatus } from "@/lib/submissions/workflow";
import type { WorkCard, WorkComment, WorkTask } from "@/lib/operations/types";

const storeFile = path.join(process.cwd(), "data", "operations-board.json");
const PROPOSAL_GATING_TASK_TITLE = "Conduct proposal placemat gating review";
const FUNDING_GATING_TASK_TITLE = "Conduct project funding gating review";
const PROPOSAL_DEFAULT_DUE_DAYS = 5;
const FUNDING_DEFAULT_DUE_DAYS = PROPOSAL_DEFAULT_DUE_DAYS * 2;
const LEGACY_GATING_TASK_TITLES = new Set(["Validate financial assumptions", "Check governance gate criteria"]);
const LEGACY_GATING_SUBTASK_TITLES = new Set([
  "Review CAPEX/OPEX assumptions",
  "Confirm payback and NPV rationale"
]);
const GOVERNANCE_ACTIVE_STATUSES = new Set([
  "AT_PGO_FGO_REVIEW",
  "FR_AT_SPONSOR_APPROVALS",
  "FR_AT_PGO_FGO_REVIEW"
]);
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const defaultDueDate = (daysFromNow: number) =>
  new Date(Date.now() + 86400000 * daysFromNow).toISOString().slice(0, 10);

const defaultDueDaysForWorkflowStage = (workflowStage: "PROPOSAL" | "FUNDING_REQUEST") =>
  workflowStage === "FUNDING_REQUEST" ? FUNDING_DEFAULT_DUE_DAYS : PROPOSAL_DEFAULT_DUE_DAYS;

const defaultGatingTaskTitleForWorkflowStage = (workflowStage: "PROPOSAL" | "FUNDING_REQUEST") =>
  workflowStage === "FUNDING_REQUEST" ? FUNDING_GATING_TASK_TITLE : PROPOSAL_GATING_TASK_TITLE;

const addDaysToDateOnly = (value: string, days: number) => {
  if (!DATE_ONLY_PATTERN.test(value)) {
    return value;
  }
  const [yearText, monthText, dayText] = value.split("-");
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const normalizeDueDate = (
  value?: string,
  workflowStage: "PROPOSAL" | "FUNDING_REQUEST" = "PROPOSAL"
) => {
  const fallback = defaultDueDate(defaultDueDaysForWorkflowStage(workflowStage));
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (DATE_ONLY_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString().slice(0, 10);
};

const readStore = async (): Promise<WorkCard[]> => {
  try {
    const raw = await fs.readFile(storeFile, "utf8");
    const parsed = JSON.parse(raw) as WorkCard[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStore = async (rows: WorkCard[]) => {
  await fs.writeFile(storeFile, JSON.stringify(rows, null, 2), "utf8");
};

const makeDefaultGovernanceTasks = (
  projectId: string,
  workflowStage: "PROPOSAL" | "FUNDING_REQUEST"
): WorkTask[] => [
  {
    id: `${projectId}-task-1`,
    title: defaultGatingTaskTitleForWorkflowStage(workflowStage),
    taskType: "GOVERNANCE_REVIEW",
    status: "To Do",
    dueDate: defaultDueDate(defaultDueDaysForWorkflowStage(workflowStage)),
    assigneeName: "Unassigned",
    subtasks: []
  }
];

const seedCard = (
  projectId: string,
  projectTitle: string,
  stage: string,
  status: string,
  lane: "Finance" | "Project Governance",
  workflowStage: "PROPOSAL" | "FUNDING_REQUEST"
): WorkCard => ({
  id: `${projectId}-${lane.replace(" ", "-")}`,
  projectId,
  projectTitle,
  stage,
  status,
  lane,
  workflowStage,
  characteristicsUpdated: lane === "Finance",
  tasks: makeDefaultGovernanceTasks(projectId, workflowStage),
  comments: []
});

const getWorkflowStageForSubmission = (submission: Awaited<ReturnType<typeof listSubmissions>>[number]) =>
  submission.workflow.entityType === "FUNDING_REQUEST" ? "FUNDING_REQUEST" : "PROPOSAL";

const isGovernanceQueueEligible = (submission: Awaited<ReturnType<typeof listSubmissions>>[number]) => {
  const lifecycleStatus = resolveWorkflowLifecycleStatus(submission);
  return GOVERNANCE_ACTIVE_STATUSES.has(lifecycleStatus);
};

const syncSubmissionWorkflowFromBoard = async (projectId: string, reason: string) => {
  await reconcileSubmissionWorkflow(projectId, {
    actorName: "System",
    actorEmail: "system@portal.local",
    reason
  });
};

const normalizeCardTasks = (card: WorkCard): WorkTask[] =>
  card.tasks.map((task) => {
    const hasLegacySubtask = task.subtasks.some((subtask) =>
      LEGACY_GATING_SUBTASK_TITLES.has(subtask.title)
    );
    const isLegacyProposalGatingTitle =
      task.title.trim().toLowerCase() === PROPOSAL_GATING_TASK_TITLE.toLowerCase();
    const shouldNormalizeTask =
      task.id === `${card.projectId}-task-1` ||
      LEGACY_GATING_TASK_TITLES.has(task.title) ||
      hasLegacySubtask ||
      (card.workflowStage === "FUNDING_REQUEST" && isLegacyProposalGatingTitle);

    const normalizedAssigneeName =
      task.assigneeName?.trim() || task.assigneeEmail?.trim() || "Unassigned";

    if (!shouldNormalizeTask) {
      return {
        ...task,
        taskType: task.taskType,
        dueDate: normalizeDueDate(task.dueDate, card.workflowStage ?? "PROPOSAL"),
        assigneeName: normalizedAssigneeName,
        assigneeEmail: task.assigneeEmail?.trim() || undefined
      };
    }

    let normalizedDueDate = normalizeDueDate(task.dueDate, card.workflowStage ?? "PROPOSAL");
    if (card.workflowStage === "FUNDING_REQUEST" && isLegacyProposalGatingTitle) {
      // Funding governance cards should be scheduled at 2x the proposal default horizon.
      normalizedDueDate = addDaysToDateOnly(normalizedDueDate, PROPOSAL_DEFAULT_DUE_DAYS);
    }

    return {
      ...task,
      title: defaultGatingTaskTitleForWorkflowStage(card.workflowStage ?? "PROPOSAL"),
      taskType: "GOVERNANCE_REVIEW",
      dueDate: normalizedDueDate,
      assigneeName: normalizedAssigneeName,
      assigneeEmail: task.assigneeEmail?.trim() || undefined,
      subtasks: []
    };
  });

const shouldAutoReconcileSponsorReview = (
  submission: Awaited<ReturnType<typeof listSubmissions>>[number]
) => {
  const lifecycleStatus = resolveWorkflowLifecycleStatus(submission);
  if (lifecycleStatus !== "FR_AT_SPONSOR_APPROVALS") {
    return false;
  }

  const stages = submission.approvalStages ?? [];
  return stages.length > 0 && stages.every((stage) => stage.status === "APPROVED");
};

export const listBoardCards = async (): Promise<WorkCard[]> => {
  const persisted = await readStore();
  const submissions = await listSubmissions();
  const hydratedSubmissions = await Promise.all(
    submissions.map(async (submission) => {
      if (!shouldAutoReconcileSponsorReview(submission)) {
        return submission;
      }

      const reconciled = await reconcileSubmissionWorkflow(submission.id, {
        actorName: "System",
        actorEmail: "system@portal.local",
        reason: "Auto-reconciled sponsor-approved funding submission into governance review."
      });
      return reconciled ?? submission;
    })
  );
  const eligibleSubmissions = hydratedSubmissions.filter((submission) => isGovernanceQueueEligible(submission));
  const eligibleCardIds = new Set(
    eligibleSubmissions.flatMap((submission) => [
      `${submission.id}-Finance`,
      `${submission.id}-Project-Governance`
    ])
  );

  // Remove stale cards for projects that are not in governance-review stages anymore.
  const merged = persisted.filter((row) => eligibleCardIds.has(row.id));

  eligibleSubmissions.forEach((submission) => {
    const financeId = `${submission.id}-Finance`;
    const govId = `${submission.id}-Project-Governance`;
    const workflowStage = getWorkflowStageForSubmission(submission);

    const financeCard = merged.find((row) => row.id === financeId);
    if (!financeCard) {
      merged.push(
        seedCard(submission.id, submission.title, submission.stage, submission.status, "Finance", workflowStage)
      );
    } else {
      financeCard.projectTitle = submission.title;
      financeCard.stage = submission.stage;
      financeCard.status = submission.status;
      const needsWorkflowReset = financeCard.workflowStage && financeCard.workflowStage !== workflowStage;
      financeCard.workflowStage = workflowStage;
      financeCard.characteristicsUpdated = true;
      financeCard.tasks = needsWorkflowReset
        ? makeDefaultGovernanceTasks(submission.id, workflowStage)
        : normalizeCardTasks(financeCard);
    }

    const governanceCard = merged.find((row) => row.id === govId);
    if (!governanceCard) {
      merged.push(
        seedCard(
          submission.id,
          submission.title,
          submission.stage,
          submission.status,
          "Project Governance",
          workflowStage
        )
      );
    } else {
      governanceCard.projectTitle = submission.title;
      governanceCard.stage = submission.stage;
      governanceCard.status = submission.status;
      const needsWorkflowReset = governanceCard.workflowStage && governanceCard.workflowStage !== workflowStage;
      governanceCard.workflowStage = workflowStage;
      governanceCard.characteristicsUpdated = governanceCard.characteristicsUpdated ?? false;
      governanceCard.tasks = needsWorkflowReset
        ? makeDefaultGovernanceTasks(submission.id, workflowStage)
        : normalizeCardTasks(governanceCard);
    }
  });

  await writeStore(merged);
  return merged;
};

export const updateTaskStatus = async (cardId: string, taskId: string, status: WorkTask["status"]): Promise<WorkCard | null> => {
  const rows = await listBoardCards();
  const card = rows.find((row) => row.id === cardId);
  if (!card) {
    return null;
  }

  card.tasks = card.tasks.map((task) => (task.id === taskId ? { ...task, status } : task));
  await writeStore(rows);
  await syncSubmissionWorkflowFromBoard(
    card.projectId,
    "Reconciled workflow after governance task status update."
  );
  return card;
};

export const addTask = async (
  cardId: string,
  title: string,
  dueDate: string,
  assigneeName?: string,
  assigneeEmail?: string
): Promise<WorkCard | null> => {
  const rows = await listBoardCards();
  const card = rows.find((row) => row.id === cardId);
  if (!card) {
    return null;
  }

  card.tasks.push({
    id: `${cardId}-task-${card.tasks.length + 1}`,
    title,
    status: "To Do",
    dueDate: normalizeDueDate(dueDate, card.workflowStage ?? "PROPOSAL"),
    assigneeName: assigneeName?.trim() || "Unassigned",
    assigneeEmail: assigneeEmail?.trim() || undefined,
    subtasks: []
  });

  await writeStore(rows);
  return card;
};

export const editTask = async (
  cardId: string,
  taskId: string,
  patch: Partial<Pick<WorkTask, "title" | "dueDate" | "status" | "assigneeName" | "assigneeEmail">>
): Promise<WorkCard | null> => {
  const rows = await listBoardCards();
  const card = rows.find((row) => row.id === cardId);
  if (!card) return null;

  card.tasks = card.tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }

    const nextAssigneeName = (patch.assigneeName ?? task.assigneeName)?.trim() || "Unassigned";
    const nextAssigneeEmail = (patch.assigneeEmail ?? task.assigneeEmail)?.trim() || undefined;
    const nextDueDate = patch.dueDate
      ? normalizeDueDate(patch.dueDate, card.workflowStage ?? "PROPOSAL")
      : task.dueDate;

    return {
      ...task,
      ...patch,
      dueDate: nextDueDate,
      assigneeName: nextAssigneeName,
      assigneeEmail: nextAssigneeEmail
    };
  });
  await writeStore(rows);
  await syncSubmissionWorkflowFromBoard(
    card.projectId,
    "Reconciled workflow after governance task edit."
  );
  return card;
};

export const removeTask = async (cardId: string, taskId: string): Promise<WorkCard | null> => {
  const rows = await listBoardCards();
  const card = rows.find((row) => row.id === cardId);
  if (!card) return null;

  card.tasks = card.tasks.filter((task) => task.id !== taskId);
  await writeStore(rows);
  return card;
};

export const markGovernanceCharacteristicsUpdated = async (projectId: string): Promise<WorkCard | null> => {
  const rows = await listBoardCards();
  const card = rows.find((row) => row.id === `${projectId}-Project-Governance`);
  if (!card) {
    return null;
  }

  card.characteristicsUpdated = true;
  card.tasks = card.tasks.map((task, index) => {
    const primaryTask = task.id === `${projectId}-task-1` || index === 0;
    if (!primaryTask || task.status !== "To Do") {
      return task;
    }
    return { ...task, status: "In Progress" };
  });

  await writeStore(rows);
  return card;
};

export const addComment = async (
  cardId: string,
  author: string,
  body: string,
  mentions: string[]
): Promise<WorkComment | null> => {
  const rows = await listBoardCards();
  const card = rows.find((row) => row.id === cardId);
  if (!card) {
    return null;
  }

  const comment: WorkComment = {
    id: `${cardId}-comment-${card.comments.length + 1}`,
    author,
    body,
    mentions,
    createdAt: new Date().toISOString()
  };

  card.comments.push(comment);
  await writeStore(rows);

  if (mentions.length > 0) {
    await addNotification({
      title: `${card.projectId} mention`,
      body: `${author} mentioned ${mentions.join(", ")} on ${card.projectTitle}`,
      href: "/operations"
    });
  }

  return comment;
};
