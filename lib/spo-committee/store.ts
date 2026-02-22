import { addNotification } from "@/lib/notifications/store";
import { getDataStorePath, shouldUseMemoryStoreCache } from "@/lib/storage/data-store-path";
import {
  cloneJson,
  isDataStorePersistenceError,
  isStoreMissingError,
  safePersistJson,
  safeReadJsonText
} from "@/lib/storage/json-file";
import { calculateFinancialMetrics, calculateNetBenefitsByYear } from "@/lib/submissions/financial-metrics";
import { getSubmissionById, listSubmissions, runWorkflowAction } from "@/lib/submissions/store";
import { resolveWorkflowLifecycleStatus } from "@/lib/submissions/workflow";
import type {
  SpoCommitteeRow,
  SpoCommitteeRowUpdate,
  SpoCommitteeState,
  SpoCommitteeVersion
} from "@/lib/spo-committee/types";

const storeFile = getDataStorePath("spo-committee.json");
let inMemorySpoCommitteeState: SpoCommitteeState | null = null;

const emptyState = (): SpoCommitteeState => ({ rows: [], versions: [] });

const readStore = async (): Promise<SpoCommitteeState> => {
  if (shouldUseMemoryStoreCache() && inMemorySpoCommitteeState) {
    return cloneJson(inMemorySpoCommitteeState);
  }
  try {
    const raw = await safeReadJsonText(storeFile);
    const parsed = JSON.parse(raw) as Partial<SpoCommitteeState>;
    const state = {
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
      versions: Array.isArray(parsed.versions) ? parsed.versions : []
    };
    inMemorySpoCommitteeState = shouldUseMemoryStoreCache() ? cloneJson(state) : null;
    return state;
  } catch (error) {
    if (isDataStorePersistenceError(error)) {
      throw error;
    }
    if (!isStoreMissingError(error)) {
      throw error;
    }
    const state = emptyState();
    inMemorySpoCommitteeState = shouldUseMemoryStoreCache() ? cloneJson(state) : null;
    return state;
  }
};

const writeStore = async (value: SpoCommitteeState) => {
  inMemorySpoCommitteeState = shouldUseMemoryStoreCache() ? cloneJson(value) : null;
  await safePersistJson(storeFile, value);
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const parseNumeric = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const parseNumericOrZero = (value: unknown) => parseNumeric(value) ?? 0;
const getCurrentFiscalYear = () => {
  const now = new Date();
  return now.getMonth() >= 10 ? now.getFullYear() + 1 : now.getFullYear();
};
const asText = (value?: string | null) => {
  const normalized = (value ?? "").trim();
  return normalized || "-";
};

const getCurrentFiscalMetrics = (submission: Awaited<ReturnType<typeof listSubmissions>>[number]) => {
  const grid = submission.financialGrid;
  const introYearRaw = submission.businessCase?.introduction?.currentYear ?? "";
  const introYear = Number.parseInt(introYearRaw, 10);
  const fallbackFiscalYear = Number.isInteger(introYear) ? introYear : getCurrentFiscalYear();
  if (!grid) {
    return {
      currentFiscalYear: fallbackFiscalYear,
      carryForwardCapex: 0,
      carryForwardExpense: 0,
      carryForwardTotal: 0,
      currentFiscalCapex: 0,
      currentFiscalExpense: 0,
      currentFiscalTotal: 0,
      currentFiscalNibt: 0,
      npv5Year: parseNumericOrZero(submission.financials.npv)
    };
  }

  const carryForwardCapex = round2(
    grid.investment.hardware.priorYears +
      grid.investment.software.priorYears +
      grid.investment.consultancyVendor.priorYears +
      grid.investment.premisesRealEstate.priorYears +
      grid.investment.otherCapital.priorYears
  );
  const carryForwardExpense = round2(grid.investment.expenses.priorYears);
  const carryForwardTotal = round2(carryForwardCapex + carryForwardExpense);

  const currentFiscalCapex = round2(
    grid.investment.hardware.currentFiscal +
      grid.investment.software.currentFiscal +
      grid.investment.consultancyVendor.currentFiscal +
      grid.investment.premisesRealEstate.currentFiscal +
      grid.investment.otherCapital.currentFiscal
  );
  const currentFiscalExpense = round2(grid.investment.expenses.currentFiscal);
  const currentFiscalTotal = round2(currentFiscalCapex + currentFiscalExpense);

  const nibtFromBusinessCase = parseNumeric(
    submission.businessCase?.pAndLImpact?.rows.find((row) => row.id === "pl-nibt")?.currentYear
  );
  const currentFiscalNibt =
    nibtFromBusinessCase ?? parseNumeric(calculateNetBenefitsByYear(grid, submission.financials)?.[0]) ?? 0;

  const npvFromBusinessCase = parseNumeric(submission.businessCase?.introduction?.npv5Year);
  const npvFromFinancials = parseNumeric(submission.financials.npv);
  const computedNpv = calculateFinancialMetrics(grid, submission.financials).npv;
  const npv5Year = npvFromBusinessCase ?? npvFromFinancials ?? computedNpv;
  const currentFiscalYear = Number.isInteger(grid.commencementFiscalYear)
    ? grid.commencementFiscalYear
    : fallbackFiscalYear;

  return {
    currentFiscalYear,
    carryForwardCapex,
    carryForwardExpense,
    carryForwardTotal,
    currentFiscalCapex,
    currentFiscalExpense,
    currentFiscalTotal,
    currentFiscalNibt: round2(currentFiscalNibt),
    npv5Year: round2(npv5Year)
  };
};

const asRow = (submission: Awaited<ReturnType<typeof listSubmissions>>[number], existing?: SpoCommitteeRow): SpoCommitteeRow => ({
  projectId: submission.id,
  projectName: submission.title,
  startDate: submission.startDate ?? "",
  endDate: submission.endDate ?? "",
  businessSponsor: asText(submission.businessSponsor ?? submission.sponsorName),
  segmentUnit: asText(submission.segmentUnit),
  portfolioEsc: asText(submission.portfolioEsc ?? submission.enterpriseProjectTheme ?? submission.opco ?? submission.businessUnit),
  fundingType: asText(submission.businessCase?.introduction?.fundingType),
  fundingSource: asText(submission.businessCase?.introduction?.fundingSource),
  projectClassification: asText(submission.projectClassification),
  projectTheme: asText(submission.projectTheme),
  projectCategory: asText(submission.category ?? submission.businessCase?.introduction?.projectCategory),
  strategicObjective: asText(submission.strategicObjective),
  ...getCurrentFiscalMetrics(submission),
  decision: existing?.decision ?? "",
  comment: existing?.comment ?? "",
  updatedAt: existing?.updatedAt
});

const syncRowsFromSubmissions = async (existingRows: SpoCommitteeRow[]) => {
  const submissions = await listSubmissions();
  const reviewItems = submissions.filter(
    (submission) => {
      const lifecycleStatus = resolveWorkflowLifecycleStatus(submission);
      return (
        lifecycleStatus === "AT_SPO_REVIEW" ||
        lifecycleStatus === "SPO_DECISION_DEFERRED" ||
        lifecycleStatus === "SPO_DECISION_REJECTED"
      );
    }
  );
  const existingByProjectId = new Map(existingRows.map((row) => [row.projectId, row]));

  return reviewItems.map((submission) => asRow(submission, existingByProjectId.get(submission.id)));
};

const normalizeAndPersist = async (): Promise<SpoCommitteeState> => {
  const current = await readStore();
  const syncedRows = await syncRowsFromSubmissions(current.rows);
  const next: SpoCommitteeState = { rows: syncedRows, versions: current.versions ?? [] };

  if (JSON.stringify(next.rows) !== JSON.stringify(current.rows)) {
    await writeStore(next);
  }

  return next;
};

const nextVersionId = (versions: SpoCommitteeVersion[]) => `SPO-V${String(versions.length + 1).padStart(3, "0")}`;

export const listSpoCommitteeState = async (): Promise<SpoCommitteeState> => normalizeAndPersist();

const applySpoDecisionUpdates = async (
  updates: SpoCommitteeRowUpdate[],
  actor: { name: string; email: string }
) => {
  for (const patch of updates) {
    if (!patch.decision) {
      continue;
    }

    const existing = await getSubmissionById(patch.projectId);
    if (!existing) {
      continue;
    }

    const alreadyTransferred =
      existing.workflow.entityType === "FUNDING_REQUEST" || existing.stage === "FUNDING";
    if (alreadyTransferred) {
      continue;
    }

    if (patch.decision !== "Approved") {
      continue;
    }

    const updated = await runWorkflowAction(existing.id, "SPO_APPROVE", {
      actorName: actor.name,
      actorEmail: actor.email,
      actorUserId: actor.email
    });

    if (updated) {
      await addNotification({
        title: `${updated.id} SPO approved`,
        body: "SPO Committee approved this item. Funding Request draft was created from the proposal.",
        href: `/submissions/${updated.id}/edit`,
        recipientEmail: updated.ownerEmail
      });
    }
  }
};

export const saveSpoCommitteeRows = async (
  updates: SpoCommitteeRowUpdate[],
  actor: { name: string; email: string }
): Promise<SpoCommitteeState> => {
  const current = await normalizeAndPersist();
  const updateByProjectId = new Map(updates.map((item) => [item.projectId, item]));
  const savedAt = new Date().toISOString();

  const rows = current.rows.map((row) => {
    const patch = updateByProjectId.get(row.projectId);
    if (!patch) {
      return row;
    }

    const nextDecision = patch.decision;
    const nextComment = patch.comment.trim();
    const changed = row.decision !== nextDecision || row.comment !== nextComment;

    return {
      ...row,
      decision: nextDecision,
      comment: nextComment,
      updatedAt: changed ? savedAt : row.updatedAt
    };
  });

  await applySpoDecisionUpdates(updates, actor);

  const syncedRows = await syncRowsFromSubmissions(rows);

  const version: SpoCommitteeVersion = {
    id: nextVersionId(current.versions),
    savedAt,
    savedByName: actor.name,
    savedByEmail: actor.email,
    rows: syncedRows
  };

  const nextState: SpoCommitteeState = {
    rows: syncedRows,
    versions: [version, ...current.versions].slice(0, 50)
  };

  await writeStore(nextState);
  return nextState;
};
