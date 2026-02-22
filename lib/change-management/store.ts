import type {
  ChangeManagementStore,
  ChangeRequestApproval,
  ChangeRequestAttachment,
  ChangeRequestComment,
  ChangeRequestFieldDelta,
  ChangeRequestRecord,
  ChangeRequestSnapshot,
  ChangeTemplate,
  ChangeThresholds
} from "@/lib/change-management/types";
import { getDataStorePath, shouldUseMemoryStoreCache } from "@/lib/storage/data-store-path";
import {
  cloneJson,
  isDataStorePersistenceError,
  isStoreMissingError,
  safePersistJson,
  safeReadJsonText
} from "@/lib/storage/json-file";

const storeFile = getDataStorePath("change-requests.json");
let inMemoryChangeManagementStore: ChangeManagementStore | null = null;

const defaultTemplates = (): ChangeTemplate[] => [
  {
    id: "template-budget-revision",
    name: "Budget Revision",
    description: "Use when approved project costs require financial revision.",
    changeType: "BUDGET_CHANGE",
    defaultImpactScope: "Financial baseline updates.",
    defaultPriority: "High"
  },
  {
    id: "template-timeline-extension",
    name: "Timeline Extension",
    description: "Use when delivery dates shift due to dependency or execution constraints.",
    changeType: "SCHEDULE_CHANGE",
    defaultImpactScope: "Delivery schedule adjustment.",
    defaultPriority: "Medium"
  },
  {
    id: "template-scope-addition",
    name: "Scope Addition",
    description: "Use when approved scope is expanded with additional deliverables.",
    changeType: "SCOPE_CHANGE",
    defaultImpactScope: "Scope and implementation plan adjustment.",
    defaultPriority: "High"
  }
];

const defaultThresholds = (): ChangeThresholds => ({
  budgetImpactThresholdAbs: 50_000,
  budgetImpactThresholdPct: 5,
  scheduleImpactThresholdDays: 14,
  cumulativeBudgetEscalationPct: 10
});

const nowIso = () => new Date().toISOString();

const defaultStore = (): ChangeManagementStore => ({
  changeRequests: [],
  fieldDeltas: [],
  approvals: [],
  comments: [],
  attachments: [],
  snapshots: [],
  templates: defaultTemplates(),
  thresholds: defaultThresholds()
});

const normalizeStore = (store: Partial<ChangeManagementStore> | null | undefined): ChangeManagementStore => ({
  changeRequests: Array.isArray(store?.changeRequests) ? store.changeRequests : [],
  fieldDeltas: Array.isArray(store?.fieldDeltas) ? store.fieldDeltas : [],
  approvals: Array.isArray(store?.approvals) ? store.approvals : [],
  comments: Array.isArray(store?.comments) ? store.comments : [],
  attachments: Array.isArray(store?.attachments) ? store.attachments : [],
  snapshots: Array.isArray(store?.snapshots) ? store.snapshots : [],
  templates:
    Array.isArray(store?.templates) && store.templates.length > 0
      ? store.templates
      : defaultTemplates(),
  thresholds: {
    ...defaultThresholds(),
    ...(store?.thresholds ?? {})
  }
});

export const readChangeManagementStore = async (): Promise<ChangeManagementStore> => {
  if (shouldUseMemoryStoreCache() && inMemoryChangeManagementStore) {
    return cloneJson(inMemoryChangeManagementStore);
  }
  try {
    const raw = await safeReadJsonText(storeFile);
    const parsed = JSON.parse(raw) as ChangeManagementStore;
    const normalized = normalizeStore(parsed);
    inMemoryChangeManagementStore = shouldUseMemoryStoreCache() ? cloneJson(normalized) : null;
    return normalized;
  } catch (error) {
    if (isDataStorePersistenceError(error)) {
      throw error;
    }
    if (!isStoreMissingError(error)) {
      throw error;
    }
    // In hosted/serverless environments (e.g., Vercel), the deployed filesystem
    // is read-only. Reads must never attempt to seed/write local JSON files.
    const seeded = defaultStore();
    inMemoryChangeManagementStore = shouldUseMemoryStoreCache() ? cloneJson(seeded) : null;
    return seeded;
  }
};

export const writeChangeManagementStore = async (store: ChangeManagementStore) => {
  inMemoryChangeManagementStore = shouldUseMemoryStoreCache() ? cloneJson(store) : null;
  await safePersistJson(storeFile, store);
};

const sortedByNewest = <T extends { createdAt?: string; updatedAt?: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => {
    const left = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const right = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    const safeLeft = Number.isNaN(left) ? 0 : left;
    const safeRight = Number.isNaN(right) ? 0 : right;
    return safeRight - safeLeft;
  });

export const listChangeRequests = async (projectId?: string): Promise<ChangeRequestRecord[]> => {
  const store = await readChangeManagementStore();
  const rows = projectId
    ? store.changeRequests.filter((row) => row.projectId === projectId)
    : store.changeRequests;
  return sortedByNewest(rows);
};

export const getChangeRequestById = async (id: string): Promise<ChangeRequestRecord | null> => {
  const store = await readChangeManagementStore();
  return store.changeRequests.find((row) => row.id === id) ?? null;
};

export const createChangeRequestRecord = async (row: ChangeRequestRecord): Promise<ChangeRequestRecord> => {
  const store = await readChangeManagementStore();
  store.changeRequests.push(row);
  await writeChangeManagementStore(store);
  return row;
};

export const updateChangeRequestRecord = async (
  id: string,
  update: Partial<ChangeRequestRecord>
): Promise<ChangeRequestRecord | null> => {
  const store = await readChangeManagementStore();
  const index = store.changeRequests.findIndex((row) => row.id === id);
  if (index === -1) {
    return null;
  }
  const updated: ChangeRequestRecord = {
    ...store.changeRequests[index],
    ...update,
    updatedAt: update.updatedAt ?? nowIso()
  };
  store.changeRequests[index] = updated;
  await writeChangeManagementStore(store);
  return updated;
};

export const replaceChangeRequestFieldDeltas = async (
  changeRequestId: string,
  deltas: ChangeRequestFieldDelta[]
) => {
  const store = await readChangeManagementStore();
  store.fieldDeltas = store.fieldDeltas.filter((row) => row.changeRequestId !== changeRequestId);
  store.fieldDeltas.push(...deltas);
  await writeChangeManagementStore(store);
  return deltas;
};

export const appendChangeRequestApprovals = async (approvals: ChangeRequestApproval[]) => {
  const store = await readChangeManagementStore();
  store.approvals.push(...approvals);
  await writeChangeManagementStore(store);
  return approvals;
};

export const updateChangeRequestApproval = async (
  approvalId: string,
  update: Partial<ChangeRequestApproval>
): Promise<ChangeRequestApproval | null> => {
  const store = await readChangeManagementStore();
  const index = store.approvals.findIndex((row) => row.id === approvalId);
  if (index === -1) {
    return null;
  }
  const updated: ChangeRequestApproval = {
    ...store.approvals[index],
    ...update,
    updatedAt: update.updatedAt ?? nowIso()
  };
  store.approvals[index] = updated;
  await writeChangeManagementStore(store);
  return updated;
};

export const appendChangeRequestSnapshot = async (snapshot: ChangeRequestSnapshot) => {
  const store = await readChangeManagementStore();
  store.snapshots.push(snapshot);
  await writeChangeManagementStore(store);
  return snapshot;
};

export const appendChangeRequestComment = async (comment: ChangeRequestComment) => {
  const store = await readChangeManagementStore();
  store.comments.push(comment);
  await writeChangeManagementStore(store);
  return comment;
};

export const appendChangeRequestAttachment = async (attachment: ChangeRequestAttachment) => {
  const store = await readChangeManagementStore();
  store.attachments.push(attachment);
  await writeChangeManagementStore(store);
  return attachment;
};

export const listChangeRequestDeltas = async (changeRequestId: string) => {
  const store = await readChangeManagementStore();
  return store.fieldDeltas.filter((row) => row.changeRequestId === changeRequestId);
};

export const listChangeRequestApprovals = async (changeRequestId: string) => {
  const store = await readChangeManagementStore();
  return store.approvals.filter((row) => row.changeRequestId === changeRequestId);
};

export const listChangeRequestComments = async (changeRequestId: string) => {
  const store = await readChangeManagementStore();
  return store.comments.filter((row) => row.changeRequestId === changeRequestId);
};

export const listChangeRequestAttachments = async (changeRequestId: string) => {
  const store = await readChangeManagementStore();
  return store.attachments.filter((row) => row.changeRequestId === changeRequestId);
};

export const listProjectChangeSnapshots = async (projectId: string) => {
  const store = await readChangeManagementStore();
  return store.snapshots.filter((row) => row.projectId === projectId);
};

export const getChangeSnapshotById = async (snapshotId?: string) => {
  if (!snapshotId) return null;
  const store = await readChangeManagementStore();
  return store.snapshots.find((row) => row.id === snapshotId) ?? null;
};

export const listChangeTemplates = async () => {
  const store = await readChangeManagementStore();
  return store.templates;
};

export const getChangeThresholds = async () => {
  const store = await readChangeManagementStore();
  return store.thresholds;
};
