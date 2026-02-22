"use client";

import { useEffect, useMemo, useState } from "react";

import type { ReferenceData } from "@/lib/admin/reference-data-config";
import { defaultReferenceData } from "@/lib/admin/reference-data-config";
import type { Role } from "@/lib/auth/roles";
import type { TeamLane, WorkCard, WorkTask } from "@/lib/operations/types";
import FundingRequestPreviewSummary from "@/components/submissions/funding-request-preview-summary";
import {
  calculateDepreciationOfCapitalByYear,
  calculateFinancialMetrics,
  calculateNetBenefitsByYear
} from "@/lib/submissions/financial-metrics";
import type { FinancialGrid, ProjectSubmission } from "@/lib/submissions/types";
import { resolveCanonicalWorkflowState } from "@/lib/submissions/workflow";

type BoardMode = "combined" | "finance" | "governance" | "project-management";
type BoardBucket = "To Do" | "In Progress" | "Closed";

type Props = {
  cards: WorkCard[];
  userName?: string | null;
  mode?: BoardMode;
};

type PortalUserOption = {
  id: string;
  name: string;
  email: string;
  roleType: Role;
  role: Role;
};

type CharacteristicsFormState = {
  category: string;
  projectTheme: string;
  strategicObjective: string;
  specificClassificationType: string;
  projectClassification: string;
  projectType: string;
  enterpriseProjectTheme: string;
  portfolioEsc: string;
  fundingType: string;
  fundingSource: string;
};

type CharacteristicsOverviewState = {
  projectName: string;
  projectDescription: string;
  financialBenefitsAndAssumptions: string;
  intangibleBenefitsAndAssumptions: string;
};

const statuses: WorkTask["status"][] = ["To Do", "In Progress", "Blocked", "Done"];
const boardBuckets: BoardBucket[] = ["To Do", "In Progress", "Closed"];
const weekDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const defaultCharacteristicsState: CharacteristicsFormState = {
  category: "Technology",
  projectTheme: "",
  strategicObjective: "",
  specificClassificationType: "",
  projectClassification: "",
  projectType: "",
  enterpriseProjectTheme: "",
  portfolioEsc: "",
  fundingType: "",
  fundingSource: ""
};

const defaultCharacteristicsOverviewState: CharacteristicsOverviewState = {
  projectName: "",
  projectDescription: "",
  financialBenefitsAndAssumptions: "",
  intangibleBenefitsAndAssumptions: ""
};
const investmentRows = [
  { key: "hardware", label: "Hardware" },
  { key: "software", label: "Software" },
  { key: "consultancyVendor", label: "Consultancy/Vendor" },
  { key: "premisesRealEstate", label: "Premises/Real Estate" },
  { key: "otherCapital", label: "Other Capital" },
  { key: "expenses", label: "Expenses" }
] as const;
const capitalRowKeys: Array<(typeof investmentRows)[number]["key"]> = [
  "hardware",
  "software",
  "consultancyVendor",
  "premisesRealEstate",
  "otherCapital"
];
const emptyFinancialDetails: ProjectSubmission["financials"] = {
  capex: 0,
  opex: 0,
  oneTimeCosts: 0,
  runRateSavings: 0,
  paybackMonths: 0,
  paybackYears: 0,
  npv: 0,
  irr: 0
};

const makeFallbackFinancialGrid = (year = new Date().getFullYear()): FinancialGrid => ({
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
});

const getCardBucket = (card: WorkCard): BoardBucket => {
  if (card.tasks.length === 0) {
    return "To Do";
  }

  const allDone = card.tasks.every((task) => task.status === "Done");
  if (allDone) {
    return "Closed";
  }

  const hasStarted = card.tasks.some((task) => task.status !== "To Do");
  if (hasStarted) {
    return "In Progress";
  }

  return "To Do";
};

const deriveProjectClassification = (value: string) => value.toUpperCase().slice(0, 4);

const deriveProjectType = (classification: string) => {
  const code = classification.toUpperCase();
  const growCodes = new Set(["GRO ", "PRO ", "DISC", "TRAN"]);
  const runCodes = new Set(["PS&E", "RG 1", "RG 2", "RG 3", "MOP ", "EVER"]);

  if (growCodes.has(code)) return "Grow";
  if (runCodes.has(code)) return "Run";
  return "";
};

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const parseIsoDateOnly = (value?: string) => {
  if (!value || !ISO_DATE_ONLY.test(value)) {
    return null;
  }
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

const formatDueDate = (value?: string) => {
  if (!value) return "-";
  const parsed = parseIsoDateOnly(value);
  if (!parsed) return "-";

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const formatFinancialValue = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : "0";

const taskCardToneByWorkflowStage = (workflowStage?: WorkCard["workflowStage"]) => {
  if (workflowStage === "FUNDING_REQUEST") {
    return "border-sky-200 bg-sky-50/70";
  }
  return "border-amber-200 bg-amber-50/70";
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function OperationsBoard({ cards: initialCards, mode = "combined" }: Props) {
  const [cards, setCards] = useState(initialCards);
  const [view, setView] = useState<"kanban" | "calendar">("kanban");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({});
  const [newTaskDate, setNewTaskDate] = useState<Record<string, string>>({});
  const [newTaskAssignee, setNewTaskAssignee] = useState<Record<string, string>>({});
  const [taskComposerOpen, setTaskComposerOpen] = useState<Record<string, boolean>>({});
  const [portalUsers, setPortalUsers] = useState<PortalUserOption[]>([]);
  const [referenceData, setReferenceData] = useState<ReferenceData>(defaultReferenceData);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectTitle, setSelectedProjectTitle] = useState<string>("");
  const [characteristicsOverview, setCharacteristicsOverview] = useState<CharacteristicsOverviewState>(
    defaultCharacteristicsOverviewState
  );
  const [characteristics, setCharacteristics] = useState<CharacteristicsFormState>(defaultCharacteristicsState);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [governancePreviewSubmission, setGovernancePreviewSubmission] = useState<ProjectSubmission | null>(null);
  const [financeModalOpen, setFinanceModalOpen] = useState(false);
  const [financeModalLoading, setFinanceModalLoading] = useState(false);
  const [financeModalError, setFinanceModalError] = useState<string | null>(null);
  const [financeSubmission, setFinanceSubmission] = useState<ProjectSubmission | null>(null);
  const [taskError, setTaskError] = useState<Record<string, string>>({});
  const financeOnly = mode === "finance";
  const governanceOnly = mode === "governance";
  const projectManagementOnly = mode === "project-management";

  const financialGridPreview = useMemo(() => {
    if (!financeSubmission) {
      return null;
    }

    if (financeSubmission.financialGrid) {
      return financeSubmission.financialGrid;
    }

    const seedYear = financeSubmission.startDate
      ? new Date(financeSubmission.startDate).getFullYear()
      : new Date(financeSubmission.createdAt).getFullYear();
    return makeFallbackFinancialGrid(Number.isFinite(seedYear) ? seedYear : new Date().getFullYear());
  }, [financeSubmission]);

  const financialDetailsPreview = useMemo(
    () => financeSubmission?.financials ?? emptyFinancialDetails,
    [financeSubmission]
  );

  const depreciationPreview = useMemo(
    () => (financialGridPreview ? calculateDepreciationOfCapitalByYear(financialGridPreview) : []),
    [financialGridPreview]
  );

  const netBenefitsPreview = useMemo(
    () => (financialGridPreview ? calculateNetBenefitsByYear(financialGridPreview, financialDetailsPreview) : []),
    [financialGridPreview, financialDetailsPreview]
  );

  const metricsPreview = useMemo(
    () => (financialGridPreview ? calculateFinancialMetrics(financialGridPreview, financialDetailsPreview) : null),
    [financialGridPreview, financialDetailsPreview]
  );

  const capitalTotalsPreview = useMemo(() => {
    if (!financialGridPreview) {
      return null;
    }

    return capitalRowKeys.reduce(
      (totals, key) => ({
        priorYears: totals.priorYears + financialGridPreview.investment[key].priorYears,
        currentFiscal: totals.currentFiscal + financialGridPreview.investment[key].currentFiscal,
        future: totals.future + financialGridPreview.investment[key].future
      }),
      { priorYears: 0, currentFiscal: 0, future: 0 }
    );
  }, [financialGridPreview]);

  const totalInvestmentTotalsPreview = useMemo(() => {
    if (!financialGridPreview || !capitalTotalsPreview) {
      return null;
    }

    return {
      priorYears: capitalTotalsPreview.priorYears + financialGridPreview.investment.expenses.priorYears,
      currentFiscal: capitalTotalsPreview.currentFiscal + financialGridPreview.investment.expenses.currentFiscal,
      future: capitalTotalsPreview.future + financialGridPreview.investment.expenses.future
    };
  }, [capitalTotalsPreview, financialGridPreview]);

  useEffect(() => {
    const loadPortalUsers = async () => {
      try {
        const response = await fetch("/api/portal-users");
        if (!response.ok) return;
        const payload = await response.json();
        setPortalUsers(payload.data ?? []);
      } catch {
        // keep assignee mode usable with unassigned fallback
      }
    };

    const loadReferenceData = async () => {
      try {
        const response = await fetch("/api/reference-data");
        if (!response.ok) return;
        const payload = await response.json();
        if (payload?.data) {
          setReferenceData((prev) => ({ ...prev, ...payload.data }));
        }
      } catch {
        // keep defaults when service unavailable
      }
    };

    void loadPortalUsers();
    void loadReferenceData();
  }, []);

  const sourceCards = useMemo(
    () =>
      financeOnly
        ? cards.filter((card) => card.lane === "Finance")
        : governanceOnly || projectManagementOnly
          ? cards.filter((card) => card.lane === "Project Governance")
          : cards,
    [cards, financeOnly, governanceOnly, projectManagementOnly]
  );

  const filteredCards = sourceCards;

  const grouped = useMemo(() => {
    return {
      Finance: filteredCards.filter((card) => card.lane === "Finance"),
      Governance: filteredCards.filter((card) => card.lane === "Project Governance")
    };
  }, [filteredCards]);

  const lanesToRender = financeOnly
    ? [{ key: "Finance", title: "Finance Team" } as const]
    : governanceOnly || projectManagementOnly
      ? [{ key: "Governance", title: "Project Governance Team" } as const]
      : [
          { key: "Finance", title: "SPO Team" } as const,
          { key: "Governance", title: "Project Governance Team" } as const
        ];

  const refreshBoard = async () => {
    const response = await fetch("/api/operations/board");
    if (!response.ok) return;
    const payload = await response.json();
    setCards(payload.data ?? []);
  };

  const patchTask = async (
    cardId: string,
    taskId: string,
    patch: Partial<Pick<WorkTask, "status" | "assigneeName" | "assigneeEmail">>
  ) => {
    const response = await fetch("/api/operations/task", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, taskId, ...patch })
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setTaskError((prev) => ({
        ...prev,
        [cardId]: payload?.message ?? "Unable to update task."
      }));
      return;
    }
    setTaskError((prev) => ({ ...prev, [cardId]: "" }));
    await refreshBoard();
  };

  const updateTaskAssignee = async (cardId: string, taskId: string, assigneeEmail: string) => {
    const selected = portalUsers.find((user) => user.email === assigneeEmail);
    await patchTask(cardId, taskId, {
      assigneeEmail: selected?.email,
      assigneeName: selected?.name ?? "Unassigned"
    });
  };

  const addTask = async (cardId: string) => {
    const title = newTaskTitle[cardId]?.trim();
    const dueDate = (newTaskDate[cardId] ?? "").trim();
    if (!title) {
      setTaskError((prev) => ({ ...prev, [cardId]: "Please enter a task title." }));
      return;
    }
    if (!dueDate) {
      setTaskError((prev) => ({ ...prev, [cardId]: "Please select a due date." }));
      return;
    }
    const parsedDueDate = parseIsoDateOnly(dueDate);
    if (!parsedDueDate) {
      setTaskError((prev) => ({ ...prev, [cardId]: "Invalid due date. Use the date picker." }));
      return;
    }

    const assigneeEmail = newTaskAssignee[cardId] ?? "";
    const selected = portalUsers.find((user) => user.email === assigneeEmail);

    const response = await fetch("/api/operations/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId,
        title,
        dueDate,
        assigneeName: selected?.name ?? "Unassigned",
        assigneeEmail: selected?.email
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      setTaskError((prev) => ({
        ...prev,
        [cardId]: payload?.message ?? "Unable to add task. Please check the due date."
      }));
      return;
    }

    setNewTaskTitle((prev) => ({ ...prev, [cardId]: "" }));
    setNewTaskDate((prev) => ({ ...prev, [cardId]: "" }));
    setNewTaskAssignee((prev) => ({ ...prev, [cardId]: "" }));
    setTaskComposerOpen((prev) => ({ ...prev, [cardId]: false }));
    setTaskError((prev) => ({ ...prev, [cardId]: "" }));
    await refreshBoard();
  };

  const removeTask = async (cardId: string, taskId: string) => {
    await fetch("/api/operations/task", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, taskId })
    });
    await refreshBoard();
  };

  const openCharacteristicsModal = async (card: WorkCard) => {
    if (card.lane !== "Project Governance") {
      return;
    }

    setModalOpen(true);
    setModalLoading(true);
    setModalSaving(false);
    setModalError(null);
    setSelectedProjectId(card.projectId);
    setSelectedProjectTitle(card.projectTitle);
    setGovernancePreviewSubmission(null);

    try {
      const response = await fetch(`/api/submissions/${encodeURIComponent(card.projectId)}`);
      if (!response.ok) {
        throw new Error("Unable to load project details");
      }

      const payload = (await response.json()) as { data?: ProjectSubmission; message?: string };
      const item = payload.data;
      if (!item) {
        throw new Error(payload.message ?? "Project not found");
      }

      const classification =
        item.projectClassification ?? deriveProjectClassification(item.specificClassificationType ?? "");
      setSelectedProjectTitle(item.title ?? card.projectTitle);
      setGovernancePreviewSubmission(item);
      setCharacteristicsOverview({
        projectName: item.title ?? "",
        projectDescription: item.summary ?? "",
        financialBenefitsAndAssumptions: item.benefits.financialAssumptions ?? "",
        intangibleBenefitsAndAssumptions: item.benefits.intangibleAssumptions ?? ""
      });
      setCharacteristics({
        category: item.category,
        projectTheme: item.projectTheme ?? "",
        strategicObjective: item.strategicObjective ?? "",
        specificClassificationType: item.specificClassificationType ?? "",
        projectClassification: classification,
        projectType: item.projectType ?? deriveProjectType(classification),
        enterpriseProjectTheme: item.enterpriseProjectTheme ?? "",
        portfolioEsc: item.portfolioEsc ?? item.enterpriseProjectTheme ?? "",
        fundingType: item.businessCase?.introduction.fundingType ?? "",
        fundingSource: item.businessCase?.introduction.fundingSource ?? ""
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load project details";
      setModalError(message);
    } finally {
      setModalLoading(false);
    }
  };

  const openFinancialModal = async (card: WorkCard) => {
    if (card.lane !== "Finance") {
      return;
    }

    setFinanceModalOpen(true);
    setFinanceModalLoading(true);
    setFinanceModalError(null);
    setFinanceSubmission(null);

    try {
      const response = await fetch(`/api/submissions/${encodeURIComponent(card.projectId)}`);
      if (!response.ok) {
        throw new Error("Unable to load financial preview");
      }

      const payload = (await response.json()) as { data?: ProjectSubmission; message?: string };
      if (!payload.data) {
        throw new Error(payload.message ?? "Project not found");
      }

      setFinanceSubmission(payload.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load financial preview";
      setFinanceModalError(message);
    } finally {
      setFinanceModalLoading(false);
    }
  };

  const closeCharacteristicsModal = () => {
    setModalOpen(false);
    setModalLoading(false);
    setModalSaving(false);
    setModalError(null);
    setSelectedProjectId(null);
    setSelectedProjectTitle("");
    setGovernancePreviewSubmission(null);
    setCharacteristicsOverview(defaultCharacteristicsOverviewState);
    setCharacteristics(defaultCharacteristicsState);
  };

  const closeFinancialModal = () => {
    setFinanceModalOpen(false);
    setFinanceModalLoading(false);
    setFinanceModalError(null);
    setFinanceSubmission(null);
  };

  const updateClassificationType = (value: string) => {
    const projectClassification = deriveProjectClassification(value);
    const projectType = deriveProjectType(projectClassification);
    setCharacteristics((prev) => ({
      ...prev,
      specificClassificationType: value,
      projectClassification,
      projectType
    }));
  };

  const showGovernanceFundingPreview =
    governancePreviewSubmission !== null &&
    resolveCanonicalWorkflowState(governancePreviewSubmission).stage === "FUNDING";

  const saveCharacteristics = async () => {
    if (!selectedProjectId) {
      return;
    }

    setModalSaving(true);
    setModalError(null);

    try {
      const response = await fetch(
        `/api/submissions/${encodeURIComponent(selectedProjectId)}/characteristics`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: characteristics.category,
            projectTheme: characteristics.projectTheme,
            strategicObjective: characteristics.strategicObjective,
            specificClassificationType: characteristics.specificClassificationType,
            enterpriseProjectTheme: characteristics.enterpriseProjectTheme,
            portfolioEsc: characteristics.portfolioEsc,
            fundingType: characteristics.fundingType,
            fundingSource: characteristics.fundingSource
          })
        }
      );

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "Failed to save characteristics");
      }

      await refreshBoard();
      closeCharacteristicsModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save characteristics";
      setModalError(message);
      setModalSaving(false);
    }
  };

  const calendarItems = useMemo(() => {
    return filteredCards.flatMap((card) =>
      card.tasks
        .map((task) => {
          const parsedDueDate = parseIsoDateOnly(task.dueDate);
          if (!parsedDueDate) {
            return null;
          }
          return {
            id: `${card.id}-${task.id}`,
            title: task.title,
            projectId: card.projectId,
            projectTitle: card.projectTitle,
            date: task.dueDate,
            lane: card.lane,
            workflowStage: card.workflowStage,
            status: task.status,
            assignee: task.assigneeName,
            dueDate: parsedDueDate
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    );
  }, [filteredCards]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, typeof calendarItems>();
    calendarItems.forEach((event) => {
      const key = toDateKey(event.dueDate);
      const dayEvents = map.get(key) ?? [];
      dayEvents.push(event);
      map.set(key, dayEvents);
    });

    map.forEach((dayEvents) =>
      dayEvents.sort((a, b) => {
        if (a.projectId === b.projectId) {
          return a.title.localeCompare(b.title);
        }
        return a.projectId.localeCompare(b.projectId);
      })
    );
    return map;
  }, [calendarItems]);

  const monthGridDates = useMemo(() => {
    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [calendarMonth]);

  const shiftCalendarMonth = (offset: number) => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">
              {financeOnly
                ? "Finance Governance Hub"
                : governanceOnly
                  ? "Project Governance Hub"
                  : projectManagementOnly
                    ? "Project Management Hub"
                    : "Governance Hubs Workspace"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {financeOnly
                ? "Finance-focused queue with assigned project tasks and due-date planning."
                : governanceOnly
                  ? "Project governance queue with assignee-managed tasks and timeline planning."
                  : projectManagementOnly
                    ? "Project management queue with assignee-managed tasks and timeline planning."
                  : "Kanban board with task assignees and calendar planning."}
            </p>
          </div>
          <div className="flex gap-2">
            <button className={`rounded-md px-3 py-1.5 text-sm ${view === "kanban" ? "accent-bg" : "border border-slate-300"}`} onClick={() => setView("kanban")} type="button">Kanban</button>
            <button className={`rounded-md px-3 py-1.5 text-sm ${view === "calendar" ? "accent-bg" : "border border-slate-300"}`} onClick={() => setView("calendar")} type="button">Calendar</button>
          </div>
        </div>

      </section>

      {view === "kanban" ? (
        <section className={`grid gap-4 ${financeOnly || governanceOnly || projectManagementOnly ? "" : "xl:grid-cols-2"}`}>
          {lanesToRender.map((lane) => (
            <article key={lane.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-lg font-semibold">{lane.title}</h3>
              <div className="grid gap-3 xl:grid-cols-3">
                {boardBuckets.map((bucket) => {
                  const laneKey: TeamLane = lane.key === "Finance" ? "Finance" : "Project Governance";
                  const laneCards = (laneKey === "Finance" ? grouped.Finance : grouped.Governance).filter(
                    (card) => getCardBucket(card) === bucket
                  );

                  return (
                    <div key={`${lane.key}-${bucket}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-sm font-semibold">{bucket}</h4>
                        <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600">
                          {laneCards.length}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {laneCards.length === 0 ? (
                          <p className="text-xs text-slate-500">No items.</p>
                        ) : (
                          laneCards.map((card) => (
                            <div key={card.id} className="rounded-lg border border-slate-200 bg-white p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  {laneKey === "Project Governance" ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void openCharacteristicsModal(card);
                                      }}
                                      className="text-left font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2"
                                      title={
                                        card.workflowStage === "FUNDING_REQUEST"
                                          ? "Open funding request preview"
                                          : "Open characteristics editor"
                                      }
                                    >
                                      {card.projectId} · {card.projectTitle}
                                    </button>
                                  ) : laneKey === "Finance" ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void openFinancialModal(card);
                                      }}
                                      className="text-left font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2"
                                      title="Open financial preview"
                                    >
                                      {card.projectId} · {card.projectTitle}
                                    </button>
                                  ) : (
                                    <p className="font-semibold">{card.projectId} · {card.projectTitle}</p>
                                  )}
                                  <p className="text-xs text-slate-600">Stage: {card.stage} · Status: {card.status}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setTaskComposerOpen((prev) => ({
                                      ...prev,
                                      [card.id]: !prev[card.id]
                                    }))
                                  }
                                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  {taskComposerOpen[card.id] ? "Close" : "+ Add"}
                                </button>
                              </div>

                              <div className="mt-2 space-y-2">
                                {card.tasks.map((task) => (
                                  <div
                                    key={task.id}
                                    className={`rounded-md border p-2 text-xs ${taskCardToneByWorkflowStage(card.workflowStage)}`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="font-medium">{task.title || "Untitled task"}</p>
                                      <div className="flex items-center gap-2">
                                        <select
                                          value={task.status}
                                          onChange={(event) => {
                                            void patchTask(card.id, task.id, { status: event.target.value as WorkTask["status"] });
                                          }}
                                          className="rounded border border-slate-300 px-1 py-0.5 text-xs"
                                        >
                                          {statuses.map((s) => (
                                            <option key={s}>{s}</option>
                                          ))}
                                        </select>
                                        <button type="button" className="text-[11px] text-red-700" onClick={() => { void removeTask(card.id, task.id); }}>
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-[11px] text-slate-500">Due: {formatDueDate(task.dueDate)}</p>
                                      <div className="inline-flex items-center gap-2 text-[11px] text-slate-500">
                                        <span>Assignee: {task.assigneeName || "Unassigned"}</span>
                                      </div>
                                    </div>
                                    <div className="mt-2 flex justify-end">
                                      <select
                                        value={task.assigneeEmail ?? ""}
                                        onChange={(event) => {
                                          void updateTaskAssignee(card.id, task.id, event.target.value);
                                        }}
                                        className="w-full sm:w-[220px] rounded border border-slate-300 px-2 py-1 text-xs"
                                      >
                                        <option value="">Unassigned</option>
                                        {portalUsers.map((user) => (
                                          <option key={user.id} value={user.email}>
                                            {user.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {taskComposerOpen[card.id] ? (
                                <div className="mt-2 rounded-md bg-slate-50 p-2 text-xs">
                                  <p className="font-medium">New task</p>
                                  <div className="mt-2 grid grid-cols-12 gap-2">
                                    <input
                                      value={newTaskTitle[card.id] ?? ""}
                                      onChange={(event) => setNewTaskTitle((prev) => ({ ...prev, [card.id]: event.target.value }))}
                                      placeholder="New task title"
                                      className="col-span-12 min-w-0 rounded border border-slate-300 px-2 py-1 sm:col-span-6"
                                    />
                                    <input
                                      type="date"
                                      value={newTaskDate[card.id] ?? ""}
                                      onChange={(event) => setNewTaskDate((prev) => ({ ...prev, [card.id]: event.target.value }))}
                                      className="col-span-12 min-w-0 rounded border border-slate-300 px-2 py-1 sm:col-span-3"
                                    />
                                    <select
                                      value={newTaskAssignee[card.id] ?? ""}
                                      onChange={(event) => setNewTaskAssignee((prev) => ({ ...prev, [card.id]: event.target.value }))}
                                      className="col-span-12 min-w-0 rounded border border-slate-300 px-2 py-1 sm:col-span-3"
                                    >
                                      <option value="">Unassigned</option>
                                      {portalUsers.map((user) => (
                                        <option key={user.id} value={user.email}>
                                          {user.name}
                                        </option>
                                      ))}
                                    </select>
                                    <div className="col-span-12 flex justify-end gap-2">
                                      <button
                                        type="button"
                                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                                        onClick={() =>
                                          setTaskComposerOpen((prev) => ({
                                            ...prev,
                                            [card.id]: false
                                          }))
                                        }
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded accent-bg px-2.5 py-1 text-xs font-semibold"
                                        onClick={() => {
                                          void addTask(card.id);
                                        }}
                                      >
                                        Add task
                                      </button>
                                    </div>
                                  </div>
                                  {taskError[card.id] ? (
                                    <p className="mt-2 text-[11px] font-medium text-red-600">{taskError[card.id]}</p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Calendar View</h3>
              <p className="text-sm text-slate-600">Scroll month-to-month to review due dates and task deliverables.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => shiftCalendarMonth(-1)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Prev
              </button>
              <p className="min-w-[150px] text-center text-sm font-semibold text-slate-800 sm:min-w-[180px]">
                {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase()}
              </p>
              <button
                type="button"
                onClick={() => shiftCalendarMonth(1)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Today
              </button>
            </div>
          </div>

          <div className="mt-4 max-w-full overflow-x-auto overscroll-x-contain pb-1 [scrollbar-gutter:stable]">
            <div className="min-w-[740px]">
              <div className="grid grid-cols-7 border border-slate-300 bg-slate-100 text-xs font-semibold uppercase tracking-[0.04em] text-slate-700">
                {weekDays.map((day) => (
                  <div key={day} className="border-r border-slate-300 px-2 py-2 last:border-r-0">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid h-[clamp(430px,58vh,560px)] grid-cols-7 grid-rows-6 border-x border-b border-slate-300">
          {monthGridDates.map((day) => {
                  const key = toDateKey(day);
                  const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                  const isToday = key === toDateKey(new Date());
                  const dayEvents = eventsByDay.get(key) ?? [];

                  return (
                    <div
                      key={key}
                      className={`flex min-h-0 flex-col overflow-hidden border-r border-t border-slate-300 px-2 py-1.5 ${
                        isCurrentMonth ? "bg-white" : "bg-slate-50"
                      } ${day.getDay() === 0 ? "bg-slate-50/70" : ""}`}
                    >
                      <p
                        className={`mb-1 shrink-0 text-xs font-semibold sm:text-sm ${
                          isCurrentMonth ? "text-slate-900" : "text-slate-400"
                        } ${isToday ? "text-brand-700" : ""}`}
                      >
                        {day.getDate()}
                      </p>
                      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
                        {dayEvents.length === 0 ? null : dayEvents.map((event) => (
                          <div
                            key={event.id}
                            className={`rounded-md px-1.5 py-1 text-[10px] leading-tight sm:text-[11px] ${
                              event.workflowStage === "FUNDING_REQUEST"
                                ? "border border-sky-200 bg-sky-50 text-sky-800"
                                : "border border-amber-200 bg-amber-50 text-amber-800"
                            }`}
                            title={`${event.projectId} · ${event.title} · ${event.status} · ${event.assignee}`}
                          >
                            <p className="font-semibold">{event.projectId}</p>
                            <p className="truncate">{event.title}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            className={`w-full rounded-xl border border-slate-200 bg-white p-5 shadow-2xl ${
              showGovernanceFundingPreview ? "max-w-6xl" : "max-w-3xl"
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {showGovernanceFundingPreview ? "Funding Request Preview" : "Project Characteristics Editor"}
                </h3>
                <p className="text-sm text-slate-600">{selectedProjectId} · {selectedProjectTitle}</p>
              </div>
              <button
                type="button"
                onClick={closeCharacteristicsModal}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {modalLoading ? (
              <p className="text-sm text-slate-600">Loading characteristics...</p>
            ) : showGovernanceFundingPreview && governancePreviewSubmission ? (
              <div className="space-y-3">
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Read-only funding request preview for governance review.
                </p>
                <div className="max-h-[70vh] overflow-y-auto pr-1">
                  <FundingRequestPreviewSummary submission={governancePreviewSubmission} />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Project Governance can update only characteristics fields in this view.
                </p>

                <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <h4 className="mb-2 text-sm font-semibold text-slate-900">A. Overview</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="font-medium text-slate-700">Project Name</span>
                      <input
                        value={characteristicsOverview.projectName}
                        readOnly
                        className="w-full rounded border border-slate-200 bg-slate-100 px-3 py-2 text-slate-700"
                      />
                    </label>

                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="font-medium text-slate-700">Project Description</span>
                      <textarea
                        value={characteristicsOverview.projectDescription}
                        readOnly
                        rows={3}
                        className="w-full resize-none rounded border border-slate-200 bg-slate-100 px-3 py-2 text-slate-700"
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Financial Benefits and Assumptions</span>
                      <textarea
                        value={characteristicsOverview.financialBenefitsAndAssumptions}
                        readOnly
                        rows={3}
                        className="w-full resize-none rounded border border-slate-200 bg-slate-100 px-3 py-2 text-slate-700"
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Intangible Benefits and Assumptions</span>
                      <textarea
                        value={characteristicsOverview.intangibleBenefitsAndAssumptions}
                        readOnly
                        rows={3}
                        className="w-full resize-none rounded border border-slate-200 bg-slate-100 px-3 py-2 text-slate-700"
                      />
                    </label>
                  </div>
                </section>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-900">B. Characteristics</h4>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Project Category</span>
                      <select
                        value={characteristics.category}
                        onChange={(event) =>
                          setCharacteristics((prev) => ({ ...prev, category: event.target.value }))
                        }
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      >
                        {referenceData.projectCategories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Project Theme</span>
                      <select
                        value={characteristics.projectTheme}
                        onChange={(event) =>
                          setCharacteristics((prev) => ({ ...prev, projectTheme: event.target.value }))
                        }
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      >
                        <option value="">Select project theme</option>
                        {referenceData.projectThemes.map((theme) => (
                          <option key={theme} value={theme}>
                            {theme}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Strategic Objective</span>
                      <select
                        value={characteristics.strategicObjective}
                        onChange={(event) =>
                          setCharacteristics((prev) => ({ ...prev, strategicObjective: event.target.value }))
                        }
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      >
                        <option value="">Select strategic objective</option>
                        {referenceData.strategicObjectives.map((objective) => (
                          <option key={objective} value={objective}>
                            {objective}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Specific Project Classification Type</span>
                      <select
                        value={characteristics.specificClassificationType}
                        onChange={(event) => updateClassificationType(event.target.value)}
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      >
                        <option value="">Select classification type</option>
                        {referenceData.classificationTypes.map((classification) => (
                          <option key={classification} value={classification}>
                            {classification}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Project Classification</span>
                      <input
                        value={characteristics.projectClassification}
                        readOnly
                        className="w-full rounded border border-slate-200 bg-slate-100 px-3 py-2 text-slate-700"
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Project Type</span>
                      <input
                        value={characteristics.projectType}
                        readOnly
                        className="w-full rounded border border-slate-200 bg-slate-100 px-3 py-2 text-slate-700"
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-slate-700">CIBC Enterprise Project Theme</span>
                      <select
                        value={characteristics.enterpriseProjectTheme}
                        onChange={(event) =>
                          setCharacteristics((prev) => ({ ...prev, enterpriseProjectTheme: event.target.value }))
                        }
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      >
                        <option value="">Select enterprise project theme</option>
                        {referenceData.enterpriseThemes.map((theme) => (
                          <option key={theme} value={theme}>
                            {theme}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Portfolio ESC</span>
                      <select
                        value={characteristics.portfolioEsc}
                        onChange={(event) =>
                          setCharacteristics((prev) => ({ ...prev, portfolioEsc: event.target.value }))
                        }
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      >
                        <option value="">&lt;Select Portfolio ESC&gt;</option>
                        {referenceData.portfolioEscs.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Funding Type</span>
                      <select
                        value={characteristics.fundingType}
                        onChange={(event) =>
                          setCharacteristics((prev) => ({ ...prev, fundingType: event.target.value }))
                        }
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      >
                        <option value="">Select funding type</option>
                        {referenceData.fundingTypes.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Funding Source</span>
                      <select
                        value={characteristics.fundingSource}
                        onChange={(event) =>
                          setCharacteristics((prev) => ({ ...prev, fundingSource: event.target.value }))
                        }
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      >
                        <option value="">Select funding source</option>
                        {referenceData.fundingSources.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                {modalError ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{modalError}</p>
                ) : null}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeCharacteristicsModal}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={modalSaving || modalLoading}
                    onClick={() => {
                      void saveCharacteristics();
                    }}
                    className="rounded-md accent-bg px-3 py-1.5 text-sm font-semibold"
                  >
                    {modalSaving ? "Saving..." : "Save Characteristics"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {financeModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-6xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Financial Preview</h3>
                <p className="text-sm text-slate-600">
                  {financeSubmission?.id ?? "--"} · {financeSubmission?.title ?? "Loading"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeFinancialModal}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {financeModalLoading ? (
              <p className="text-sm text-slate-600">Loading financial preview...</p>
            ) : financeModalError ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {financeModalError}
              </p>
            ) : !financeSubmission || !financialGridPreview || !capitalTotalsPreview || !totalInvestmentTotalsPreview ? (
              <p className="text-sm text-slate-600">No financial data is available for this project yet.</p>
            ) : (
              <div className="space-y-4">
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Read-only Financial tab preview for Finance Governance Hub.
                </p>

                <div className="grid gap-4">
                  <section className="rounded-lg border border-slate-200 bg-white p-3">
                    <h4 className="mb-2 text-sm font-semibold text-slate-900">A. Overview</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Project Name</p>
                        <p className="text-sm font-medium text-slate-900">{financeSubmission.title || "-"}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Funding Type</p>
                        <p className="text-sm font-medium text-slate-900">
                          {financeSubmission.businessCase?.introduction.fundingType || "-"}
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Funding Source</p>
                        <p className="text-sm font-medium text-slate-900">
                          {financeSubmission.businessCase?.introduction.fundingSource || "-"}
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Project Description</p>
                        <p className="whitespace-pre-wrap text-sm text-slate-900">{financeSubmission.summary || "-"}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">
                          Financial Benefits and Assumptions
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-slate-900">
                          {financeSubmission.benefits?.financialAssumptions || "-"}
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">
                          Intangible Benefits and Assumptions
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-slate-900">
                          {financeSubmission.benefits?.intangibleAssumptions || "-"}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white p-3">
                    <h4 className="mb-2 text-sm font-semibold text-slate-900">
                      Total Investment (US &#39;000s)
                    </h4>
                    <div>
                      <table className="w-full table-fixed border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700">
                            <th className="w-[36%] border border-slate-200 px-2 py-1 text-left">Line Item</th>
                            <th className="border border-slate-200 px-2 py-1 text-center">Prior Yrs</th>
                            <th className="border border-slate-200 px-2 py-1 text-center">
                              F{financialGridPreview.commencementFiscalYear}
                            </th>
                            <th className="border border-slate-200 px-2 py-1 text-center">Future</th>
                            <th className="border border-slate-200 px-2 py-1 text-center">Life</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-slate-100 font-semibold text-slate-900">
                            <td className="border border-slate-200 px-2 py-1">Capital</td>
                            <td className="border border-slate-200 px-2 py-1 text-center">
                              {formatFinancialValue(capitalTotalsPreview.priorYears)}
                            </td>
                            <td className="border border-slate-200 px-2 py-1 text-center">
                              {formatFinancialValue(capitalTotalsPreview.currentFiscal)}
                            </td>
                            <td className="border border-slate-200 px-2 py-1 text-center">
                              {formatFinancialValue(capitalTotalsPreview.future)}
                            </td>
                            <td className="border border-slate-200 px-2 py-1 text-center">
                              {formatFinancialValue(
                                capitalTotalsPreview.priorYears +
                                  capitalTotalsPreview.currentFiscal +
                                  capitalTotalsPreview.future
                              )}
                            </td>
                          </tr>
                          {investmentRows.map((row) => {
                            const rowValues = financialGridPreview.investment[row.key];
                            const rowLife =
                              rowValues.priorYears + rowValues.currentFiscal + rowValues.future;
                            const rowClass =
                              row.key === "expenses" ? "font-semibold text-slate-900" : "text-slate-700";

                            return (
                              <tr key={row.key} className={rowClass}>
                                <td className="border border-slate-200 px-2 py-1">{row.label}</td>
                                <td className="border border-slate-200 px-2 py-1 text-center">
                                  {formatFinancialValue(rowValues.priorYears)}
                                </td>
                                <td className="border border-slate-200 px-2 py-1 text-center">
                                  {formatFinancialValue(rowValues.currentFiscal)}
                                </td>
                                <td className="border border-slate-200 px-2 py-1 text-center">
                                  {formatFinancialValue(rowValues.future)}
                                </td>
                                <td className="border border-slate-200 px-2 py-1 text-center">
                                  {formatFinancialValue(rowLife)}
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="bg-slate-100 font-semibold text-slate-900">
                            <td className="border border-slate-200 px-2 py-1">Total Investment</td>
                            <td className="border border-slate-200 px-2 py-1 text-center">
                              {formatFinancialValue(totalInvestmentTotalsPreview.priorYears)}
                            </td>
                            <td className="border border-slate-200 px-2 py-1 text-center">
                              {formatFinancialValue(totalInvestmentTotalsPreview.currentFiscal)}
                            </td>
                            <td className="border border-slate-200 px-2 py-1 text-center">
                              {formatFinancialValue(totalInvestmentTotalsPreview.future)}
                            </td>
                            <td className="border border-slate-200 px-2 py-1 text-center">
                              {formatFinancialValue(
                                totalInvestmentTotalsPreview.priorYears +
                                  totalInvestmentTotalsPreview.currentFiscal +
                                  totalInvestmentTotalsPreview.future
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white p-3">
                    <h4 className="mb-2 text-sm font-semibold text-slate-900">
                      Incremental Revenue &amp; Cost (US &#39;000s)
                    </h4>
                    <div>
                      <table className="w-full table-fixed border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700">
                            <th className="w-[30%] border border-slate-200 px-2 py-1 text-left">Line Item</th>
                            {financialGridPreview.incremental.years.map((year) => (
                              <th key={year} className="border border-slate-200 px-2 py-1 text-center">
                                F{year}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="border border-slate-200 px-2 py-1 text-slate-700">Revenue</td>
                            {financialGridPreview.incremental.revenue.map((value, index) => (
                              <td key={`revenue-${index}`} className="border border-slate-200 px-2 py-1 text-center">
                                {formatFinancialValue(value)}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="border border-slate-200 px-2 py-1 text-slate-700">Saved Costs</td>
                            {financialGridPreview.incremental.savedCosts.map((value, index) => (
                              <td key={`saved-${index}`} className="border border-slate-200 px-2 py-1 text-center">
                                {formatFinancialValue(value)}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="border border-slate-200 px-2 py-1 text-slate-700">
                              Additional Operating Costs
                            </td>
                            {financialGridPreview.incremental.addlOperatingCosts.map((value, index) => (
                              <td key={`ops-${index}`} className="border border-slate-200 px-2 py-1 text-center">
                                {formatFinancialValue(value)}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="border border-slate-200 px-2 py-1 text-slate-700">
                              Depreciation of Capital
                            </td>
                            {depreciationPreview.map((value, index) => (
                              <td key={`dep-${index}`} className="border border-slate-200 px-2 py-1 text-center">
                                {formatFinancialValue(value)}
                              </td>
                            ))}
                          </tr>
                          <tr className="bg-slate-100 font-semibold text-slate-900">
                            <td className="border border-slate-200 px-2 py-1">Net Benefits</td>
                            {netBenefitsPreview.map((value, index) => (
                              <td key={`net-${index}`} className="border border-slate-200 px-2 py-1 text-center">
                                {formatFinancialValue(value)}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Payback (Yrs)</p>
                    <p className="text-sm font-semibold text-slate-900">{metricsPreview?.paybackLabel ?? "-"}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">NPV</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {metricsPreview ? formatFinancialValue(metricsPreview.npv) : "-"}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">IRR (%)</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {metricsPreview?.irrPct === null
                        ? "N/A"
                        : metricsPreview
                          ? formatFinancialValue(metricsPreview.irrPct)
                          : "-"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
