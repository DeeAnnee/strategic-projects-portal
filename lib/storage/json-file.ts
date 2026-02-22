import { promises as fs } from "node:fs";
import path from "node:path";

const READONLY_FS_ERROR_CODES = new Set(["EROFS", "EACCES", "EPERM"]);

export const isReadonlyFsError = (error: unknown) => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  const code = String((error as NodeJS.ErrnoException).code ?? "");
  return READONLY_FS_ERROR_CODES.has(code);
};

export const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const safePersistJson = async (filePath: string, payload: unknown) => {
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
