export type TeamLane = "Finance" | "Project Governance";
export type TaskStatus = "To Do" | "In Progress" | "Blocked" | "Done";

export type SubTask = {
  id: string;
  title: string;
  done: boolean;
};

export type WorkTask = {
  id: string;
  title: string;
  taskType?: "GOVERNANCE_REVIEW" | "ASSIGN_PROJECT_MANAGER";
  status: TaskStatus;
  dueDate: string;
  assigneeName: string;
  assigneeEmail?: string;
  subtasks: SubTask[];
};

export type WorkComment = {
  id: string;
  author: string;
  body: string;
  mentions: string[];
  createdAt: string;
};

export type WorkCard = {
  id: string;
  projectId: string;
  projectTitle: string;
  stage: string;
  status: string;
  lane: TeamLane;
  workflowStage?: "PROPOSAL" | "FUNDING_REQUEST";
  characteristicsUpdated?: boolean;
  tasks: WorkTask[];
  comments: WorkComment[];
};
