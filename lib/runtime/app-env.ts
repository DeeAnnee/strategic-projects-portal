const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();

export const getAppEnv = () =>
  normalize(process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || "development");

export const isStagingAppEnv = () => getAppEnv() === "staging";

