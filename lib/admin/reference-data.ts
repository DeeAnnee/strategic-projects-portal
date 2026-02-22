import { promises as fs } from "node:fs";
import path from "node:path";

import {
  defaultReferenceData,
  type ReferenceData,
  type ReferenceDataKey
} from "@/lib/admin/reference-data-config";

export {
  defaultReferenceData,
  referenceDataLabels
} from "@/lib/admin/reference-data-config";
export type { ReferenceData, ReferenceDataKey } from "@/lib/admin/reference-data-config";

const storeFile = path.join(process.cwd(), "data", "reference-data.json");

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
  try {
    const raw = await fs.readFile(storeFile, "utf8");
    return JSON.parse(raw) as Partial<ReferenceData>;
  } catch {
    return null;
  }
};

const writeStore = async (data: ReferenceData) => {
  await fs.writeFile(storeFile, JSON.stringify(data, null, 2), "utf8");
};

export const getReferenceData = async (): Promise<ReferenceData> => {
  const current = await readRawStore();
  if (!current) {
    const seeded = normalizeReferenceData();
    await writeStore(seeded);
    return seeded;
  }

  const normalized = normalizeReferenceData(current);
  await writeStore(normalized);
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
