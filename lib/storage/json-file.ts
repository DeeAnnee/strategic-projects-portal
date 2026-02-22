import { promises as fs } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";

const READONLY_FS_ERROR_CODES = new Set(["EROFS", "EACCES", "EPERM"]);
let jsonStoreAvailabilityPromise: Promise<boolean> | null = null;

export const isReadonlyFsError = (error: unknown) => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  const code = String((error as NodeJS.ErrnoException).code ?? "");
  return READONLY_FS_ERROR_CODES.has(code);
};

export const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const hasDatabaseUrl = () => Boolean(process.env.DATABASE_URL?.trim());
const hasExplicitDbStoreFlag = () => Boolean(process.env.DATA_STORE_USE_DATABASE?.trim());

const getStoreKey = (filePath: string) => `json-store:${path.basename(filePath)}`;

const shouldUseDatabaseStore = () => {
  if (!hasDatabaseUrl()) {
    return false;
  }
  if (hasExplicitDbStoreFlag()) {
    return true;
  }
  if (process.env.VERCEL?.trim()) {
    return true;
  }
  const appEnv = (process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? "").trim().toLowerCase();
  return appEnv === "staging" || appEnv === "production";
};

const ensureJsonStoreTable = async () => {
  if (!shouldUseDatabaseStore()) {
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
  return jsonStoreAvailabilityPromise;
};

const readFromDatabaseStore = async (filePath: string): Promise<string | null> => {
  if (!(await ensureJsonStoreTable())) {
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
  } catch {
    return null;
  }
};

const writeToDatabaseStore = async (filePath: string, payload: unknown): Promise<boolean> => {
  if (!(await ensureJsonStoreTable())) {
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
  } catch {
    return false;
  }
};

export const safeReadJsonText = async (filePath: string) => {
  const dbPayload = await readFromDatabaseStore(filePath);
  if (dbPayload !== null) {
    return dbPayload;
  }
  return fs.readFile(filePath, "utf8");
};

export const safePersistJson = async (filePath: string, payload: unknown) => {
  const dbPersisted = await writeToDatabaseStore(filePath, payload);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return true;
  } catch (error) {
    if (isReadonlyFsError(error)) {
      return dbPersisted;
    }
    throw error;
  }
};
