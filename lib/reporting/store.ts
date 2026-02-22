import { promises as fs } from "node:fs";

import type { ApiPrincipal } from "@/lib/auth/api";
import { normalizeRoleType } from "@/lib/auth/roles";
import {
  defaultDatasetRegistryStore,
  defaultReportsStore,
  defaultTemplatesStore
} from "@/lib/reporting/defaults";
import type {
  DatasetRegistryStore,
  ReportAccessControl,
  ReportDefinition,
  ReportingDatasetDefinition,
  ReportingPermissionLevel,
  ReportsStore,
  SavedReport,
  SavedTemplate,
  TemplatesStore
} from "@/lib/reporting/types";
import { getDataStorePath, shouldUseMemoryStoreCache } from "@/lib/storage/data-store-path";
import { cloneJson, safePersistJson } from "@/lib/storage/json-file";

const reportingDatasetsFile = getDataStorePath("reporting-datasets.json");
const reportingReportsFile = getDataStorePath("reporting-reports.json");
const reportingTemplatesFile = getDataStorePath("reporting-templates.json");
const inMemoryReportingStore = new Map<string, unknown>();

const nowIso = () => new Date().toISOString();
const normalizeEmail = (value?: string | null) => (value ?? "").trim().toLowerCase();

const readJson = async <T,>(filePath: string, fallback: T): Promise<T> => {
  if (shouldUseMemoryStoreCache() && inMemoryReportingStore.has(filePath)) {
    return cloneJson(inMemoryReportingStore.get(filePath) as T);
  }
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as T;
    if (shouldUseMemoryStoreCache()) {
      inMemoryReportingStore.set(filePath, cloneJson(parsed));
    } else {
      inMemoryReportingStore.delete(filePath);
    }
    return parsed;
  } catch {
    const seeded = cloneJson(fallback);
    if (shouldUseMemoryStoreCache()) {
      inMemoryReportingStore.set(filePath, cloneJson(seeded));
    } else {
      inMemoryReportingStore.delete(filePath);
    }
    return seeded;
  }
};

const writeJson = async <T,>(filePath: string, payload: T) => {
  if (shouldUseMemoryStoreCache()) {
    inMemoryReportingStore.set(filePath, cloneJson(payload));
  } else {
    inMemoryReportingStore.delete(filePath);
  }
  await safePersistJson(filePath, payload);
};

export const readDatasetRegistry = async (): Promise<DatasetRegistryStore> => {
  const fallback = defaultDatasetRegistryStore();
  return readJson<DatasetRegistryStore>(reportingDatasetsFile, fallback);
};

export const writeDatasetRegistry = async (payload: DatasetRegistryStore) => {
  await writeJson(reportingDatasetsFile, payload);
};

export const readReportsStore = async (): Promise<ReportsStore> => {
  const fallback = defaultReportsStore();
  return readJson<ReportsStore>(reportingReportsFile, fallback);
};

export const writeReportsStore = async (payload: ReportsStore) => {
  await writeJson(reportingReportsFile, payload);
};

export const readTemplatesStore = async (): Promise<TemplatesStore> => {
  const fallback = defaultTemplatesStore();
  return readJson<TemplatesStore>(reportingTemplatesFile, fallback);
};

export const writeTemplatesStore = async (payload: TemplatesStore) => {
  await writeJson(reportingTemplatesFile, payload);
};

export const canManageReportingAdmin = (principal: ApiPrincipal) =>
  normalizeRoleType(principal.roleType) === "ADMIN";

const hasDatasetPermission = (
  dataset: ReportingDatasetDefinition,
  principal: ApiPrincipal,
  requiredLevel: ReportingPermissionLevel
): boolean => {
  const roleType = normalizeRoleType(principal.roleType);
  const permission = dataset.permissions.find((entry) => entry.roleTypes.includes(roleType));
  if (!permission) {
    return false;
  }

  if (requiredLevel === "VIEW") {
    return permission.level === "VIEW" || permission.level === "BUILD";
  }
  return permission.level === "BUILD";
};

export const listDatasetsForPrincipal = async (
  principal: ApiPrincipal,
  requiredLevel: ReportingPermissionLevel = "VIEW"
): Promise<ReportingDatasetDefinition[]> => {
  const store = await readDatasetRegistry();
  return store.datasets.filter((dataset) => hasDatasetPermission(dataset, principal, requiredLevel));
};

export const getDatasetByIdForPrincipal = async (
  principal: ApiPrincipal,
  datasetId: string,
  requiredLevel: ReportingPermissionLevel = "VIEW"
): Promise<ReportingDatasetDefinition | null> => {
  const datasets = await listDatasetsForPrincipal(principal, requiredLevel);
  return datasets.find((dataset) => dataset.datasetId === datasetId) ?? null;
};

const canViewAssetAccess = (principal: ApiPrincipal, access: ReportAccessControl) => {
  if (normalizeRoleType(principal.roleType) === "ADMIN") {
    return true;
  }

  const email = normalizeEmail(principal.email);
  if (!email) return false;

  return (
    access.ownerUserId === principal.id ||
    normalizeEmail(access.ownerEmail) === email ||
    access.viewers.some((item) => normalizeEmail(item) === email) ||
    access.editors.some((item) => normalizeEmail(item) === email)
  );
};

const canEditAssetAccess = (principal: ApiPrincipal, access: ReportAccessControl) => {
  if (normalizeRoleType(principal.roleType) === "ADMIN") {
    return true;
  }

  const email = normalizeEmail(principal.email);
  if (!email) return false;

  return (
    access.ownerUserId === principal.id ||
    normalizeEmail(access.ownerEmail) === email ||
    access.editors.some((item) => normalizeEmail(item) === email)
  );
};

export const listReportsForPrincipal = async (principal: ApiPrincipal, search?: string) => {
  const store = await readReportsStore();
  const query = (search ?? "").trim().toLowerCase();

  return store.reports
    .filter((report) => canViewAssetAccess(principal, report.access))
    .filter((report) => {
      if (!query) return true;
      return (
        report.title.toLowerCase().includes(query) ||
        report.description.toLowerCase().includes(query) ||
        report.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    })
    .sort((left, right) => (left.updatedAt > right.updatedAt ? -1 : 1));
};

export const getReportForPrincipal = async (
  principal: ApiPrincipal,
  reportId: string
): Promise<SavedReport | null> => {
  const store = await readReportsStore();
  const report = store.reports.find((item) => item.id === reportId);
  if (!report) return null;
  return canViewAssetAccess(principal, report.access) ? report : null;
};

export const canEditReportForPrincipal = async (principal: ApiPrincipal, reportId: string) => {
  const store = await readReportsStore();
  const report = store.reports.find((item) => item.id === reportId);
  if (!report) return false;
  return canEditAssetAccess(principal, report.access);
};

const buildAccess = (principal: ApiPrincipal): ReportAccessControl => ({
  ownerUserId: principal.id,
  ownerEmail: principal.email ?? "",
  viewers: [],
  editors: []
});

const buildReportId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

const appendVersion = (
  principal: ApiPrincipal,
  existingVersions: SavedReport["versions"] | SavedTemplate["versions"],
  definition: ReportDefinition
) => {
  const nextVersion = existingVersions.length + 1;
  return [
    ...existingVersions,
    {
      version: nextVersion,
      savedAt: nowIso(),
      savedByUserId: principal.id,
      savedByEmail: principal.email ?? "",
      definition
    }
  ];
};

export const saveReportForPrincipal = async (
  principal: ApiPrincipal,
  payload: {
    id?: string;
    title: string;
    description: string;
    tags?: string[];
    definition: ReportDefinition;
    sourceTemplateId?: string;
  }
): Promise<SavedReport> => {
  const store = await readReportsStore();

  if (payload.id) {
    const index = store.reports.findIndex((item) => item.id === payload.id);
    if (index === -1) {
      throw new Error("Report not found.");
    }
    const existing = store.reports[index];
    if (!canEditAssetAccess(principal, existing.access)) {
      throw new Error("Forbidden");
    }

    const updated: SavedReport = {
      ...existing,
      title: payload.title,
      description: payload.description,
      tags: payload.tags ?? existing.tags,
      definition: payload.definition,
      updatedAt: nowIso(),
      versions: appendVersion(principal, existing.versions, payload.definition),
      sourceTemplateId: payload.sourceTemplateId ?? existing.sourceTemplateId
    };

    store.reports[index] = updated;
    await writeReportsStore(store);
    return updated;
  }

  const createdAt = nowIso();
  const report: SavedReport = {
    id: buildReportId("report"),
    type: "REPORT",
    title: payload.title,
    description: payload.description,
    tags: payload.tags ?? [],
    createdAt,
    updatedAt: createdAt,
    access: buildAccess(principal),
    definition: payload.definition,
    versions: [
      {
        version: 1,
        savedAt: createdAt,
        savedByUserId: principal.id,
        savedByEmail: principal.email ?? "",
        definition: payload.definition
      }
    ],
    sourceTemplateId: payload.sourceTemplateId
  };

  store.reports.unshift(report);
  await writeReportsStore(store);
  return report;
};

export const cloneReportForPrincipal = async (
  principal: ApiPrincipal,
  reportId: string,
  title?: string
): Promise<SavedReport> => {
  const existing = await getReportForPrincipal(principal, reportId);
  if (!existing) {
    throw new Error("Report not found.");
  }

  return saveReportForPrincipal(principal, {
    title: title?.trim() || `${existing.title} (Copy)`,
    description: existing.description,
    tags: [...existing.tags],
    definition: existing.definition,
    sourceTemplateId: existing.sourceTemplateId
  });
};

export const shareReportForPrincipal = async (
  principal: ApiPrincipal,
  reportId: string,
  share: { viewers?: string[]; editors?: string[] }
): Promise<SavedReport> => {
  const store = await readReportsStore();
  const index = store.reports.findIndex((item) => item.id === reportId);
  if (index === -1) {
    throw new Error("Report not found.");
  }

  const existing = store.reports[index];
  if (!canEditAssetAccess(principal, existing.access)) {
    throw new Error("Forbidden");
  }

  const viewers = Array.from(new Set((share.viewers ?? []).map((item) => normalizeEmail(item)).filter(Boolean)));
  const editors = Array.from(new Set((share.editors ?? []).map((item) => normalizeEmail(item)).filter(Boolean)));

  const updated: SavedReport = {
    ...existing,
    access: {
      ...existing.access,
      viewers,
      editors
    },
    updatedAt: nowIso()
  };

  store.reports[index] = updated;
  await writeReportsStore(store);
  return updated;
};

export const listTemplatesForPrincipal = async (principal: ApiPrincipal, search?: string) => {
  const store = await readTemplatesStore();
  const query = (search ?? "").trim().toLowerCase();

  return store.templates
    .filter((template) => canViewAssetAccess(principal, template.access))
    .filter((template) => {
      if (!query) return true;
      return (
        template.title.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    })
    .sort((left, right) => (left.updatedAt > right.updatedAt ? -1 : 1));
};

export const getTemplateForPrincipal = async (
  principal: ApiPrincipal,
  templateId: string
): Promise<SavedTemplate | null> => {
  const store = await readTemplatesStore();
  const template = store.templates.find((item) => item.id === templateId);
  if (!template) return null;
  return canViewAssetAccess(principal, template.access) ? template : null;
};

export const saveTemplateForPrincipal = async (
  principal: ApiPrincipal,
  payload: {
    id?: string;
    title: string;
    description: string;
    tags?: string[];
    definition: ReportDefinition;
    isFeatured?: boolean;
  }
): Promise<SavedTemplate> => {
  const store = await readTemplatesStore();

  if (payload.id) {
    const index = store.templates.findIndex((item) => item.id === payload.id);
    if (index === -1) throw new Error("Template not found.");

    const existing = store.templates[index];
    if (!canEditAssetAccess(principal, existing.access)) {
      throw new Error("Forbidden");
    }

    const updated: SavedTemplate = {
      ...existing,
      title: payload.title,
      description: payload.description,
      tags: payload.tags ?? existing.tags,
      definition: payload.definition,
      updatedAt: nowIso(),
      versions: appendVersion(principal, existing.versions, payload.definition),
      isFeatured:
        normalizeRoleType(principal.roleType) === "ADMIN" && payload.isFeatured !== undefined
          ? payload.isFeatured
          : existing.isFeatured
    };

    store.templates[index] = updated;
    await writeTemplatesStore(store);
    return updated;
  }

  const createdAt = nowIso();
  const template: SavedTemplate = {
    id: buildReportId("template"),
    type: "TEMPLATE",
    title: payload.title,
    description: payload.description,
    tags: payload.tags ?? [],
    createdAt,
    updatedAt: createdAt,
    access: buildAccess(principal),
    definition: payload.definition,
    versions: [
      {
        version: 1,
        savedAt: createdAt,
        savedByUserId: principal.id,
        savedByEmail: principal.email ?? "",
        definition: payload.definition
      }
    ],
    isFeatured:
      normalizeRoleType(principal.roleType) === "ADMIN"
        ? payload.isFeatured
        : false
  };

  store.templates.unshift(template);
  await writeTemplatesStore(store);
  return template;
};

export const cloneTemplateForPrincipal = async (
  principal: ApiPrincipal,
  templateId: string,
  title?: string
): Promise<SavedTemplate> => {
  const existing = await getTemplateForPrincipal(principal, templateId);
  if (!existing) throw new Error("Template not found.");

  return saveTemplateForPrincipal(principal, {
    title: title?.trim() || `${existing.title} (Copy)`,
    description: existing.description,
    tags: [...existing.tags],
    definition: existing.definition,
    isFeatured: false
  });
};

export const shareTemplateForPrincipal = async (
  principal: ApiPrincipal,
  templateId: string,
  share: { viewers?: string[]; editors?: string[] }
): Promise<SavedTemplate> => {
  const store = await readTemplatesStore();
  const index = store.templates.findIndex((item) => item.id === templateId);
  if (index === -1) {
    throw new Error("Template not found.");
  }

  const existing = store.templates[index];
  if (!canEditAssetAccess(principal, existing.access)) {
    throw new Error("Forbidden");
  }

  const viewers = Array.from(new Set((share.viewers ?? []).map((item) => normalizeEmail(item)).filter(Boolean)));
  const editors = Array.from(new Set((share.editors ?? []).map((item) => normalizeEmail(item)).filter(Boolean)));

  const updated: SavedTemplate = {
    ...existing,
    access: {
      ...existing.access,
      viewers,
      editors
    },
    updatedAt: nowIso()
  };

  store.templates[index] = updated;
  await writeTemplatesStore(store);
  return updated;
};

export const registerDataset = async (
  principal: ApiPrincipal,
  dataset: Omit<ReportingDatasetDefinition, "updatedAt">
): Promise<ReportingDatasetDefinition> => {
  if (!canManageReportingAdmin(principal)) {
    throw new Error("Forbidden");
  }

  const store = await readDatasetRegistry();
  const idx = store.datasets.findIndex((item) => item.datasetId === dataset.datasetId);
  const next = {
    ...dataset,
    updatedAt: nowIso()
  };

  if (idx >= 0) {
    store.datasets[idx] = next;
  } else {
    store.datasets.push(next);
  }

  await writeDatasetRegistry(store);
  return next;
};
