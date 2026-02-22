import type { ApiPrincipal } from "@/lib/auth/api";
import { runReport } from "@/lib/reporting/engine";
import {
  cloneReportForPrincipal,
  cloneTemplateForPrincipal,
  getReportForPrincipal,
  getTemplateForPrincipal,
  listDatasetsForPrincipal,
  listReportsForPrincipal,
  listTemplatesForPrincipal,
  saveReportForPrincipal,
  saveTemplateForPrincipal,
  shareReportForPrincipal,
  shareTemplateForPrincipal
} from "@/lib/reporting/store";
import type {
  ReportQueryRunInput,
  ReportingDatasetDefinition,
  SavedReport,
  SavedTemplate
} from "@/lib/reporting/types";

const normalizeEmail = (value?: string | null) => (value ?? "").trim().toLowerCase();

export const getReportsHomePayload = async (principal: ApiPrincipal, search?: string) => {
  const [reports, templates, datasets] = await Promise.all([
    listReportsForPrincipal(principal, search),
    listTemplatesForPrincipal(principal, search),
    listDatasetsForPrincipal(principal, "VIEW")
  ]);

  const email = normalizeEmail(principal.email);

  const recentReports = reports.slice(0, 8);
  const sharedWithMe = reports.filter((report) => {
    const ownerEmail = normalizeEmail(report.access.ownerEmail);
    return ownerEmail !== email;
  });
  const featuredTemplates = templates.filter((template) => template.isFeatured).slice(0, 8);

  const insightFeed = await Promise.all(
    recentReports.slice(0, 3).map(async (report) => {
      try {
        const run = await runSavedReportForPrincipal(principal, report.id, {});
        return {
          reportId: report.id,
          reportTitle: report.title,
          summary: run.insights.executiveSummary,
          generatedAt: run.generatedAt
        };
      } catch {
        return {
          reportId: report.id,
          reportTitle: report.title,
          summary: "No insight available for current filters.",
          generatedAt: new Date().toISOString()
        };
      }
    })
  );

  return {
    datasets,
    recentReports,
    sharedWithMe,
    featuredTemplates,
    insightFeed
  };
};

const getAllowedDatasetsForRun = async (principal: ApiPrincipal, datasetIds: string[]) => {
  const datasets = await listDatasetsForPrincipal(principal, "VIEW");
  const byId = new Map(datasets.map((dataset) => [dataset.datasetId, dataset]));
  return datasetIds
    .map((id) => byId.get(id))
    .filter((dataset): dataset is ReportingDatasetDefinition => Boolean(dataset));
};

export const runSavedReportForPrincipal = async (
  principal: ApiPrincipal,
  reportId: string,
  input: ReportQueryRunInput
) => {
  const report = await getReportForPrincipal(principal, reportId);
  if (!report) {
    throw new Error("Report not found.");
  }

  const datasets = await getAllowedDatasetsForRun(principal, report.definition.datasetIds);
  return runReport(principal, report, datasets, input);
};

export const runSavedTemplateForPrincipal = async (
  principal: ApiPrincipal,
  templateId: string,
  input: ReportQueryRunInput
) => {
  const template = await getTemplateForPrincipal(principal, templateId);
  if (!template) {
    throw new Error("Template not found.");
  }

  const datasets = await getAllowedDatasetsForRun(principal, template.definition.datasetIds);
  return runReport(principal, template, datasets, input);
};

export const saveReport = async (
  principal: ApiPrincipal,
  payload: {
    id?: string;
    title: string;
    description: string;
    tags?: string[];
    definition: SavedReport["definition"];
    sourceTemplateId?: string;
  }
) => saveReportForPrincipal(principal, payload);

export const cloneReport = async (principal: ApiPrincipal, reportId: string, title?: string) =>
  cloneReportForPrincipal(principal, reportId, title);

export const shareReport = async (
  principal: ApiPrincipal,
  reportId: string,
  share: { viewers?: string[]; editors?: string[] }
) => shareReportForPrincipal(principal, reportId, share);

export const saveTemplate = async (
  principal: ApiPrincipal,
  payload: {
    id?: string;
    title: string;
    description: string;
    tags?: string[];
    definition: SavedTemplate["definition"];
    isFeatured?: boolean;
  }
) => saveTemplateForPrincipal(principal, payload);

export const cloneTemplate = async (principal: ApiPrincipal, templateId: string, title?: string) =>
  cloneTemplateForPrincipal(principal, templateId, title);

export const shareTemplate = async (
  principal: ApiPrincipal,
  templateId: string,
  share: { viewers?: string[]; editors?: string[] }
) => shareTemplateForPrincipal(principal, templateId, share);
