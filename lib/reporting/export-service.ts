import type { ApiPrincipal } from "@/lib/auth/api";
import { runSavedReportForPrincipal, runSavedTemplateForPrincipal } from "@/lib/reporting/service";
import type { ReportQueryRunInput, ReportRunResult } from "@/lib/reporting/types";

export const resolveReportRunForExport = async (
  principal: ApiPrincipal,
  input: {
    reportId?: string;
    templateId?: string;
    runInput?: ReportQueryRunInput;
  }
): Promise<ReportRunResult> => {
  if (input.reportId) {
    return runSavedReportForPrincipal(principal, input.reportId, input.runInput ?? {});
  }
  if (input.templateId) {
    return runSavedTemplateForPrincipal(principal, input.templateId, input.runInput ?? {});
  }

  throw new Error("Provide reportId or templateId for export.");
};
