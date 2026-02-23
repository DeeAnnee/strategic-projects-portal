import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockMkdir,
  mockReadFile,
  mockWriteFile,
  mockExecuteRawUnsafe,
  mockQueryRawUnsafe
} = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockExecuteRawUnsafe: vi.fn(),
  mockQueryRawUnsafe: vi.fn()
}));

vi.mock("node:fs", () => ({
  promises: {
    mkdir: mockMkdir,
    readFile: mockReadFile,
    writeFile: mockWriteFile
  }
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRawUnsafe: mockExecuteRawUnsafe,
    $queryRawUnsafe: mockQueryRawUnsafe
  }
}));

const ORIGINAL_ENV = process.env;

const resetStoreEnv = () => {
  delete process.env.APP_ENV;
  delete process.env.NEXT_PUBLIC_APP_ENV;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;
  delete process.env.DATABASE_URL;
  delete process.env.DATA_STORE_USE_DATABASE;
};

describe("json-file persistence mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    resetStoreEnv();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("requires DATABASE_URL in staging and never falls back to filesystem writes", async () => {
    process.env.APP_ENV = "staging";

    const { safePersistJson } = await import("@/lib/storage/json-file");
    await expect(safePersistJson("/tmp/submissions.json", { ok: true })).rejects.toMatchObject({
      name: "DataStorePersistenceError",
      code: "PERSISTENCE_DB_URL_MISSING",
      status: 503
    });

    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("returns explicit DB write error in production and never writes local JSON", async () => {
    process.env.APP_ENV = "production";
    process.env.DATABASE_URL = "postgresql://unit-test";
    mockExecuteRawUnsafe.mockRejectedValueOnce(new Error("db write failed"));

    const { safePersistJson } = await import("@/lib/storage/json-file");
    await expect(safePersistJson("/tmp/submissions.json", { ok: true })).rejects.toMatchObject({
      name: "DataStorePersistenceError",
      code: "PERSISTENCE_DB_WRITE_FAILED",
      status: 503
    });

    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("uses DB-only reads in Vercel preview and surfaces DB read failures", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.DATABASE_URL = "postgresql://unit-test";
    mockQueryRawUnsafe.mockRejectedValue(new Error("db read failed"));

    const { safeReadJsonText } = await import("@/lib/storage/json-file");
    await expect(safeReadJsonText("/tmp/submissions.json")).rejects.toMatchObject({
      name: "DataStorePersistenceError",
      code: "PERSISTENCE_DB_READ_FAILED",
      status: 503
    });

    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("throws ENOENT when DB row is missing in required mode instead of reading filesystem", async () => {
    process.env.APP_ENV = "staging";
    process.env.DATABASE_URL = "postgresql://unit-test";
    mockQueryRawUnsafe.mockResolvedValue([]);

    const { safeReadJsonText } = await import("@/lib/storage/json-file");
    await expect(safeReadJsonText("/tmp/submissions.json")).rejects.toMatchObject({
      code: "ENOENT"
    });

    expect(mockReadFile).not.toHaveBeenCalled();
  });
});
