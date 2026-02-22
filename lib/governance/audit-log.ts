import { promises as fs } from "node:fs";
import path from "node:path";

export type GovernanceAuditOutcome = "SUCCESS" | "FAILED" | "DENIED";
export type GovernanceAuditArea =
  | "SUBMISSIONS"
  | "WORKFLOW"
  | "ADMIN"
  | "SPO_COMMITTEE"
  | "OPERATIONS"
  | "SECURITY";

export type GovernanceAuditEntry = {
  id: string;
  createdAt: string;
  area: GovernanceAuditArea;
  action: string;
  entityType: string;
  entityId?: string;
  outcome: GovernanceAuditOutcome;
  actorName?: string;
  actorEmail?: string;
  actorRole?: string;
  details?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

const storeFile = path.join(process.cwd(), "data", "governance-audit-log.json");
const maxEntries = 5000;

const normalizeMetadata = (
  input?: Record<string, unknown>
): GovernanceAuditEntry["metadata"] | undefined => {
  if (!input) return undefined;
  const entries = Object.entries(input).flatMap(([key, value]) => {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      return [[key, value] as const];
    }
    return [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const readStore = async (): Promise<GovernanceAuditEntry[]> => {
  try {
    const raw = await fs.readFile(storeFile, "utf8");
    const parsed = JSON.parse(raw) as GovernanceAuditEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStore = async (rows: GovernanceAuditEntry[]) => {
  await fs.writeFile(storeFile, JSON.stringify(rows, null, 2), "utf8");
};

export const appendGovernanceAuditLog = async (
  input: Omit<GovernanceAuditEntry, "id" | "createdAt" | "metadata"> & {
    createdAt?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<GovernanceAuditEntry> => {
  const rows = await readStore();
  const entry: GovernanceAuditEntry = {
    id: `gov-audit-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    createdAt: input.createdAt ?? new Date().toISOString(),
    area: input.area,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    outcome: input.outcome,
    actorName: input.actorName?.trim() || undefined,
    actorEmail: input.actorEmail?.trim().toLowerCase() || undefined,
    actorRole: input.actorRole?.trim() || undefined,
    details: input.details?.trim() || undefined,
    metadata: normalizeMetadata(input.metadata)
  };

  rows.push(entry);
  const trimmed = rows.slice(-maxEntries);
  await writeStore(trimmed);
  return entry;
};

export const listGovernanceAuditLog = async (limit = 200): Promise<GovernanceAuditEntry[]> => {
  const rows = await readStore();
  const normalizedLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 1000) : 200;
  return rows
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, normalizedLimit);
};
