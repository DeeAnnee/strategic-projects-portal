import path from "node:path";

const defaultDataDir = path.join(process.cwd(), "data");
const serverlessDataDir = path.join("/tmp", "strategic-projects-portal", "data");

const hasValue = (value?: string | null) => Boolean(value && value.trim().length > 0);

const shouldUseServerlessDataDir = () => {
  if (hasValue(process.env.DATA_STORE_USE_TMP)) {
    return true;
  }
  if (hasValue(process.env.VERCEL) || hasValue(process.env.AWS_EXECUTION_ENV) || hasValue(process.env.AWS_LAMBDA_FUNCTION_NAME)) {
    return true;
  }
  return false;
};

export const getDataStoreDir = () => {
  const configured = process.env.DATA_STORE_DIR?.trim();
  if (configured) {
    return configured;
  }
  return shouldUseServerlessDataDir() ? serverlessDataDir : defaultDataDir;
};

export const getDataStorePath = (fileName: string) => path.join(getDataStoreDir(), fileName);
