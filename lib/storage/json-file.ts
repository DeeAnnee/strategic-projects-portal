import { promises as fs } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";

const READONLY_FS_ERROR_CODES = new Set(["EROFS", "EACCES", "EPERM"]);
const DB_REQUIRED_APP_ENVS = new Set(["staging", "production"]);
const DB_REQUIRED_VERCEL_ENVS = new Set(["preview", "production"]);
let jsonStoreAvailabilityPromise: Promise<boolean> | null = null;

export const isReadonlyFsError = (error: unknown) => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  const code = String((error as NodeJS.ErrnoException).code ?? "");
  return READONLY_FS_ERROR_CODES.has(code);
};

export const isStoreMissingError = (error: unknown) =>
  Boolean(error && typeof error === "object" && "code" in (error as Record<string, unknown>) && (error as NodeJS.ErrnoException).code === "ENOENT");

export const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const hasDatabaseUrl = () => Boolean(process.env.DATABASE_URL?.trim());
const hasExplicitDbStoreFlag = () => Boolean(process.env.DATA_STORE_USE_DATABASE?.trim());
const hasValue = (value?: string | null) => Boolean(value && value.trim().length > 0);
const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();

const getStoreKey = (filePath: string) => `json-store:${path.basename(filePath)}`;

export type DataStorePersistenceErrorCode =
  | "PERSISTENCE_DB_URL_MISSING"
  | "PERSISTENCE_DB_INIT_FAILED"
  | "PERSISTENCE_DB_READ_FAILED"
  | "PERSISTENCE_DB_WRITE_FAILED";

export class DataStorePersistenceError extends Error {
  readonly code: DataStorePersistenceErrorCode;
  readonly status: number;

  constructor(code: DataStorePersistenceErrorCode, message: string, status = 503) {
    super(message);
    this.name = "DataStorePersistenceError";
    this.code = code;
    this.status = status;
  }
}

export const isDataStorePersistenceError = (
  error: unknown
): error is DataStorePersistenceError =>
  error instanceof DataStorePersistenceError ||
  (Boolean(error) &&
    typeof error === "object" &&
    "name" in (error as Record<string, unknown>) &&
    (error as { name?: string }).name === "DataStorePersistenceError" &&
    "code" in (error as Record<string, unknown>) &&
    "status" in (error as Record<string, unknown>));

type DataStoreMode = "FILE" | "PREFERRED_DATABASE" | "REQUIRED_DATABASE";

const isDatabaseRequiredRuntime = () => {
  const appEnv = normalize(process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV);
  if (DB_REQUIRED_APP_ENVS.has(appEnv)) {
    return true;
  }
  const vercelEnv = normalize(process.env.VERCEL_ENV);
  if (DB_REQUIRED_VERCEL_ENVS.has(vercelEnv)) {
    return true;
  }
  return false;
};

const getDataStoreMode = (): DataStoreMode => {
  if (isDatabaseRequiredRuntime()) {
    return "REQUIRED_DATABASE";
  }
  if (hasExplicitDbStoreFlag()) {
    return "PREFERRED_DATABASE";
  }
  if (hasDatabaseUrl() && hasValue(process.env.VERCEL)) {
    return "PREFERRED_DATABASE";
  }
  return "FILE";
};

const ensureJsonStoreTable = async () => {
  if (!hasDatabaseUrl()) {
    return false;
  }
  if (!jsonStoreAvailabilityPromise) {
    jsonStoreAvailabilityPromise = (async () => {
      try {
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "JsonStore" (
            "key" TEXT PRIMARY KEY,
            "payload" JSONB NOT NULL,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        return true;
      } catch {
        return false;
      }
    })();
  }

  const available = await jsonStoreAvailabilityPromise;
  if (!available) {
    jsonStoreAvailabilityPromise = null;
  }
  return available;
};

const toPersistenceError = (
  code: DataStorePersistenceErrorCode,
  details?: string
) => {
  if (code === "PERSISTENCE_DB_URL_MISSING") {
    return new DataStorePersistenceError(
      code,
      "Database persistence is required in this environment, but DATABASE_URL is not configured."
    );
  }
  if (code === "PERSISTENCE_DB_INIT_FAILED") {
    return new DataStorePersistenceError(
      code,
      details
        ? `Database persistence setup failed: ${details}`
        : "Database persistence setup failed. Ensure Prisma can access the JsonStore table."
    );
  }
  if (code === "PERSISTENCE_DB_READ_FAILED") {
    return new DataStorePersistenceError(
      code,
      details ? `Database read failed: ${details}` : "Database read failed for persistent store."
    );
  }
  return new DataStorePersistenceError(
    code,
    details ? `Database write failed: ${details}` : "Database write failed for persistent store."
  );
};

const assertDatabaseConfigured = (mode: DataStoreMode) => {
  if (mode !== "REQUIRED_DATABASE") {
    return;
  }
  if (!hasDatabaseUrl()) {
    throw toPersistenceError("PERSISTENCE_DB_URL_MISSING");
  }
};

const readFromDatabaseStore = async (
  filePath: string,
  mode: Exclude<DataStoreMode, "FILE">
): Promise<string | null> => {
  const strict = mode === "REQUIRED_DATABASE";
  if (!(await ensureJsonStoreTable())) {
    if (strict) {
      throw toPersistenceError("PERSISTENCE_DB_INIT_FAILED");
    }
    return null;
  }
  try {
    const key = getStoreKey(filePath);
    const rows = await prisma.$queryRawUnsafe<Array<{ payload: unknown }>>(
      `SELECT "payload" FROM "JsonStore" WHERE "key" = $1 LIMIT 1`,
      key
    );
    if (!rows.length) {
      return null;
    }
    return JSON.stringify(rows[0].payload);
  } catch (error) {
    if (strict) {
      throw toPersistenceError(
        "PERSISTENCE_DB_READ_FAILED",
        error instanceof Error ? error.message : "Unknown database error."
      );
    }
    return null;
  }
};

const writeToDatabaseStore = async (
  filePath: string,
  payload: unknown,
  mode: Exclude<DataStoreMode, "FILE">
): Promise<boolean> => {
  const strict = mode === "REQUIRED_DATABASE";
  if (!(await ensureJsonStoreTable())) {
    if (strict) {
      throw toPersistenceError("PERSISTENCE_DB_INIT_FAILED");
    }
    return false;
  }
  try {
    const key = getStoreKey(filePath);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "JsonStore" ("key", "payload", "createdAt", "updatedAt")
       VALUES ($1, $2::jsonb, NOW(), NOW())
       ON CONFLICT ("key")
       DO UPDATE SET "payload" = EXCLUDED."payload", "updatedAt" = NOW()`,
      key,
      JSON.stringify(payload)
    );
    return true;
  } catch (error) {
    if (strict) {
      throw toPersistenceError(
        "PERSISTENCE_DB_WRITE_FAILED",
        error instanceof Error ? error.message : "Unknown database error."
      );
    }
    return false;
  }
};

export const safeReadJsonText = async (filePath: string) => {
  const mode = getDataStoreMode();
  assertDatabaseConfigured(mode);
  if (mode !== "FILE") {
    const dbPayload = await readFromDatabaseStore(filePath, mode);
    if (dbPayload !== null) {
      return dbPayload;
    }
    const missing = new Error(`No database-backed payload found for ${getStoreKey(filePath)}.`);
    (missing as NodeJS.ErrnoException).code = "ENOENT";
    throw missing;
  }
  return fs.readFile(filePath, "utf8");
};

export const safePersistJson = async (filePath: string, payload: unknown) => {
  const mode = getDataStoreMode();
  assertDatabaseConfigured(mode);
  if (mode !== "FILE") {
    const dbPersisted = await writeToDatabaseStore(filePath, payload, mode);
    if (!dbPersisted) {
      throw toPersistenceError(
        "PERSISTENCE_DB_WRITE_FAILED",
        `Unable to persist ${getStoreKey(filePath)}`
      );
    }
    return true;
  }

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return true;
  } catch (error) {
    if (isReadonlyFsError(error)) {
      return false;
    }
    throw error;
  }
};
