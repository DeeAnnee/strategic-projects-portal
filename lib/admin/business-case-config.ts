import { promises as fs } from "node:fs";
import path from "node:path";

import {
  defaultBusinessCaseConfig,
  type BusinessCaseConfig,
  type DepreciationCategoryMap,
  type DepreciationRule,
  type KpiMetricMap,
  type PayGradeMonthlySalaryMap
} from "@/lib/admin/business-case-config-defs";

const storeFile = path.join(process.cwd(), "data", "business-case-config.json");
let inMemoryBusinessCaseConfig: BusinessCaseConfig | null = null;

const isReadonlyFsError = (error: unknown) => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  const code = String((error as NodeJS.ErrnoException).code ?? "");
  return code === "EROFS" || code === "EACCES" || code === "EPERM";
};

const cleanList = (values: string[]) => {
  const deduped = new Set<string>();
  for (const raw of values) {
    const trimmed = raw.trim();
    if (trimmed) deduped.add(trimmed);
  }
  return [...deduped];
};

const normalizeDepreciationRules = (rules?: DepreciationRule[]) => {
  const source = rules && rules.length > 0 ? rules : defaultBusinessCaseConfig.depreciationRules;
  const seen = new Set<string>();
  const normalized: DepreciationRule[] = [];

  for (const rule of source) {
    const label = rule.label.trim();
    if (!label || seen.has(label)) continue;
    const usefulLifeYears = Number.isFinite(rule.usefulLifeYears)
      ? Math.max(1, Math.round(rule.usefulLifeYears))
      : 1;
    normalized.push({ label, usefulLifeYears });
    seen.add(label);
  }

  return normalized;
};

const normalizeKpiMetricMap = (map?: KpiMetricMap): KpiMetricMap => {
  const source = map && Object.keys(map).length > 0 ? map : defaultBusinessCaseConfig.kpiMetricMap;
  const normalized: KpiMetricMap = {};

  for (const [rawCategory, rawMetrics] of Object.entries(source)) {
    const category = rawCategory.trim();
    if (!category) continue;
    normalized[category] = cleanList(rawMetrics ?? []);
  }

  return normalized;
};

const normalizeDepreciationCategoryMap = (map?: DepreciationCategoryMap): DepreciationCategoryMap => {
  const source =
    map && Object.keys(map).length > 0 ? map : defaultBusinessCaseConfig.depreciationCategoryMap;
  const normalized: DepreciationCategoryMap = {};

  for (const [rawCategory, rawItems] of Object.entries(source)) {
    const category = rawCategory.trim();
    if (!category) continue;
    normalized[category] = cleanList(rawItems ?? []);
  }

  return normalized;
};

const normalizePayGradeMonthlySalaryMap = (
  map?: PayGradeMonthlySalaryMap
): PayGradeMonthlySalaryMap => {
  const source =
    map && Object.keys(map).length > 0
      ? map
      : defaultBusinessCaseConfig.payGradeMonthlySalaryUsd;
  const normalized: PayGradeMonthlySalaryMap = {};

  for (const [rawPayGrade, rawSalary] of Object.entries(source)) {
    const payGrade = rawPayGrade.trim();
    if (!payGrade) continue;
    const salary = Number(rawSalary);
    if (!Number.isFinite(salary) || salary < 0) continue;
    normalized[payGrade] = Math.round((salary + Number.EPSILON) * 100) / 100;
  }

  return Object.keys(normalized).length > 0
    ? normalized
    : { ...defaultBusinessCaseConfig.payGradeMonthlySalaryUsd };
};

const normalizeBusinessCaseConfig = (input?: Partial<BusinessCaseConfig>): BusinessCaseConfig => {
  return {
    depreciationRules: normalizeDepreciationRules(input?.depreciationRules),
    depreciationCategoryMap: normalizeDepreciationCategoryMap(input?.depreciationCategoryMap),
    kpiMetricMap: normalizeKpiMetricMap(input?.kpiMetricMap),
    payGradeMonthlySalaryUsd: normalizePayGradeMonthlySalaryMap(input?.payGradeMonthlySalaryUsd)
  };
};

const readRawStore = async (): Promise<Partial<BusinessCaseConfig> | null> => {
  if (inMemoryBusinessCaseConfig) {
    return inMemoryBusinessCaseConfig;
  }
  try {
    const raw = await fs.readFile(storeFile, "utf8");
    return JSON.parse(raw) as Partial<BusinessCaseConfig>;
  } catch {
    return null;
  }
};

const writeStore = async (data: BusinessCaseConfig) => {
  inMemoryBusinessCaseConfig = data;
  try {
    await fs.writeFile(storeFile, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    if (!isReadonlyFsError(error)) {
      throw error;
    }
  }
};

export const getBusinessCaseConfig = async (): Promise<BusinessCaseConfig> => {
  const current = await readRawStore();
  const normalized = normalizeBusinessCaseConfig(current ?? undefined);
  inMemoryBusinessCaseConfig = normalized;
  return normalized;
};

export const updateBusinessCaseConfig = async (
  patch: Partial<BusinessCaseConfig>
): Promise<BusinessCaseConfig> => {
  const current = await getBusinessCaseConfig();
  const next = normalizeBusinessCaseConfig({
    depreciationRules: patch.depreciationRules ?? current.depreciationRules,
    depreciationCategoryMap: patch.depreciationCategoryMap ?? current.depreciationCategoryMap,
    kpiMetricMap: patch.kpiMetricMap ?? current.kpiMetricMap,
    payGradeMonthlySalaryUsd: patch.payGradeMonthlySalaryUsd ?? current.payGradeMonthlySalaryUsd
  });
  await writeStore(next);
  return next;
};
