import {
  defaultReferenceData,
  type ReferenceData,
  type ReferenceDataKey
} from "@/lib/admin/reference-data-config";
import { getDataStorePath, shouldUseMemoryStoreCache } from "@/lib/storage/data-store-path";
import {
  isDataStorePersistenceError,
  isStoreMissingError,
  safePersistJson,
  safeReadJsonText
} from "@/lib/storage/json-file";

export {
  defaultReferenceData,
  referenceDataLabels
} from "@/lib/admin/reference-data-config";
export type { ReferenceData, ReferenceDataKey } from "@/lib/admin/reference-data-config";

const storeFile = getDataStorePath("reference-data.json");
let inMemoryReferenceData: ReferenceData | null = null;

const cleanValues = (values: string[]) => {
  const deduped = new Set<string>();
  for (const raw of values) {
    const trimmed = raw.trim();
    if (trimmed) {
      deduped.add(trimmed);
    }
  }
  return [...deduped];
};

const normalizeReferenceData = (input?: Partial<ReferenceData>): ReferenceData => {
  const base = defaultReferenceData;
  return {
    executiveSponsors: cleanValues(input?.executiveSponsors ?? base.executiveSponsors),
    businessSponsors: cleanValues(input?.businessSponsors ?? base.businessSponsors),
    segments: cleanValues(input?.segments ?? base.segments),
    projectThemes: cleanValues(input?.projectThemes ?? base.projectThemes),
    strategicObjectives: cleanValues(input?.strategicObjectives ?? base.strategicObjectives),
    classificationTypes: cleanValues(input?.classificationTypes ?? base.classificationTypes),
    enterpriseThemes: cleanValues(input?.enterpriseThemes ?? base.enterpriseThemes),
    portfolioEscs: cleanValues(input?.portfolioEscs ?? base.portfolioEscs),
    projectCategories: cleanValues(input?.projectCategories ?? base.projectCategories),
    fundingSources: cleanValues(input?.fundingSources ?? base.fundingSources),
    fundingTypes: cleanValues(input?.fundingTypes ?? base.fundingTypes),
    projectImportanceLevels: cleanValues(input?.projectImportanceLevels ?? base.projectImportanceLevels),
    projectComplexityLevels: cleanValues(input?.projectComplexityLevels ?? base.projectComplexityLevels),
    userExperienceImpacts: cleanValues(input?.userExperienceImpacts ?? base.userExperienceImpacts),
    resourceTypes: cleanValues(input?.resourceTypes ?? base.resourceTypes),
    capexOpexTypes: cleanValues(input?.capexOpexTypes ?? base.capexOpexTypes),
    availabilityApplicationTiers: cleanValues(
      input?.availabilityApplicationTiers ?? base.availabilityApplicationTiers
    ),
    strategicNonStrategicOptions: cleanValues(
      input?.strategicNonStrategicOptions ?? base.strategicNonStrategicOptions
    ),
    riskAssessmentRequiredOptions: cleanValues(
      input?.riskAssessmentRequiredOptions ?? base.riskAssessmentRequiredOptions
    ),
    businessUnits: cleanValues(input?.businessUnits ?? base.businessUnits),
    opcos: cleanValues(input?.opcos ?? base.opcos)
  };
};

const readRawStore = async (): Promise<Partial<ReferenceData> | null> => {
  if (shouldUseMemoryStoreCache() && inMemoryReferenceData) {
    return inMemoryReferenceData;
  }
  try {
    const raw = await safeReadJsonText(storeFile);
    return JSON.parse(raw) as Partial<ReferenceData>;
  } catch (error) {
    if (isDataStorePersistenceError(error)) {
      throw error;
    }
    if (!isStoreMissingError(error)) {
      throw error;
    }
    return null;
  }
};

const writeStore = async (data: ReferenceData) => {
  inMemoryReferenceData = shouldUseMemoryStoreCache() ? data : null;
  await safePersistJson(storeFile, data);
};

export const getReferenceData = async (): Promise<ReferenceData> => {
  const current = await readRawStore();
  const normalized = normalizeReferenceData(current ?? undefined);
  inMemoryReferenceData = shouldUseMemoryStoreCache() ? normalized : null;
  return normalized;
};

export const updateReferenceList = async (
  key: ReferenceDataKey,
  values: string[]
): Promise<ReferenceData> => {
  const current = await getReferenceData();
  const next: ReferenceData = {
    ...current,
    [key]: cleanValues(values)
  };
  await writeStore(next);
  return next;
};
