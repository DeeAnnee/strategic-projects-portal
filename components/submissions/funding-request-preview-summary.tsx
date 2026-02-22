"use client";

import type { ProjectSubmission } from "@/lib/submissions/types";

type Props = {
  submission: ProjectSubmission;
};

const formatDate = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const formatFinancialValue = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : "0";

const includesValue = (value: string | undefined) => Boolean(value && value.trim().length > 0);

const isHumanRowPopulated = (row: {
  roleDescription: string;
  responsibilities: string;
  resourceName: string;
}) => includesValue(row.roleDescription) || includesValue(row.responsibilities) || includesValue(row.resourceName);

const isTechRowPopulated = (row: { impactedApplication: string; rationaleForCompletingWork: string }) =>
  includesValue(row.impactedApplication) || includesValue(row.rationaleForCompletingWork);

export default function FundingRequestPreviewSummary({ submission }: Props) {
  const businessCase = submission.businessCase;

  if (!businessCase) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-[0.06em] text-slate-700">Funding Request Summary</h4>
        <p className="text-sm text-slate-600">Funding Request data is unavailable for this project.</p>
      </section>
    );
  }

  const humanRows = businessCase.resourceRequirements.humanResources;
  const techRows = businessCase.resourceRequirements.technologyApplicationResources;
  const populatedHumanRows = humanRows.filter(isHumanRowPopulated);
  const populatedTechRows = techRows.filter(isTechRowPopulated);
  const hiringRequiredCount = humanRows.filter((row) => row.hiringRequired.toLowerCase().startsWith("yes")).length;

  const capitalRows = businessCase.capitalExpenses.rows.filter((row) => !row.isTotal);
  const oneTimeRows = businessCase.oneTimeCosts.rows.filter((row) => !row.item.toLowerCase().startsWith("total"));
  const pAndLTotalRows = businessCase.pAndLImpact.rows.filter(
    (row) => row.isTotal || row.label.toLowerCase().startsWith("total") || row.id === "pl-nibt"
  );

  const totalCapital = capitalRows.reduce((sum, row) => sum + row.totalCost, 0);
  const totalOneTime = oneTimeRows.reduce((sum, row) => sum + row.projectTotal, 0);
  const currentYearSpend = oneTimeRows.reduce((sum, row) => sum + row.currentYearSpend, 0);
  const currentYearPlan = oneTimeRows.reduce((sum, row) => sum + row.currentYearPlan, 0);

  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-slate-700">A. Project Overview</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Project Name</p>
            <p className="text-sm font-medium text-slate-900">{submission.title || "-"}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Project ID</p>
            <p className="text-sm font-medium text-slate-900">{submission.id}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Funding Type</p>
            <p className="text-sm font-medium text-slate-900">{businessCase.introduction.fundingType || "-"}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Funding Source</p>
            <p className="text-sm font-medium text-slate-900">{businessCase.introduction.fundingSource || "-"}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Portfolio ESC</p>
            <p className="text-sm font-medium text-slate-900">
              {submission.portfolioEsc || submission.enterpriseProjectTheme || "-"}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2">
            <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Project Description</p>
            <p className="whitespace-pre-wrap text-sm text-slate-900">
              {businessCase.projectOverview.projectDescription || submission.summary || "-"}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2">
            <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Opportunity Statement</p>
            <p className="whitespace-pre-wrap text-sm text-slate-900">
              {businessCase.projectOverview.opportunityStatement || "-"}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Start Date</p>
            <p className="text-sm font-medium text-slate-900">{formatDate(businessCase.scopeSchedule.start || submission.startDate)}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.06em] text-slate-500">Go-Live Date</p>
            <p className="text-sm font-medium text-slate-900">{formatDate(businessCase.scopeSchedule.goLive || submission.targetGoLive)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-slate-700">
          B. Resource Requirements (Summary)
        </h4>
        <div className="grid gap-4 lg:grid-cols-2">
          <table className="w-full table-fixed border-collapse text-xs">
            <tbody>
              <tr>
                <th className="w-[38%] border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">Internal Requirements</th>
                <td className="border border-slate-200 px-2 py-1 text-slate-700">{businessCase.resourceRequirements.internalFteRequirements || "-"}</td>
              </tr>
              <tr>
                <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">External Support Required</th>
                <td className="border border-slate-200 px-2 py-1 text-slate-700">{businessCase.resourceRequirements.externalSupportRequired || "-"}</td>
              </tr>
              <tr>
                <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">Hiring Required</th>
                <td className="border border-slate-200 px-2 py-1 text-slate-700">{businessCase.resourceRequirements.hiringRequired || "-"}</td>
              </tr>
              <tr>
                <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">Additional Details</th>
                <td className="border border-slate-200 px-2 py-1 text-slate-700">{businessCase.resourceRequirements.additionalResourceDetails || "-"}</td>
              </tr>
            </tbody>
          </table>

          <table className="w-full table-fixed border-collapse text-xs">
            <tbody>
              <tr>
                <th className="w-[58%] border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">Human Resource Rows Captured</th>
                <td className="border border-slate-200 px-2 py-1 text-center text-slate-800">{populatedHumanRows.length}</td>
              </tr>
              <tr>
                <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">Technology Resource Rows Captured</th>
                <td className="border border-slate-200 px-2 py-1 text-center text-slate-800">{populatedTechRows.length}</td>
              </tr>
              <tr>
                <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">Hiring Required Roles</th>
                <td className="border border-slate-200 px-2 py-1 text-center text-slate-800">{hiringRequiredCount}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-slate-700">
          C. Financial Plan (Summary)
        </h4>
        <div className="grid gap-4 lg:grid-cols-2">
          <table className="w-full table-fixed border-collapse text-xs">
            <tbody>
              <tr>
                <th className="w-[56%] border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">Current Year Spend vs Plan</th>
                <td className="border border-slate-200 px-2 py-1 text-right text-slate-800">{businessCase.introduction.currentYearSpendVsPlan || "-"}</td>
              </tr>
              <tr>
                <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">Total Cost (Capex + One Time)</th>
                <td className="border border-slate-200 px-2 py-1 text-right text-slate-800">{businessCase.introduction.totalCostCapexOneTime || "-"}</td>
              </tr>
              <tr>
                <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">NPV (5 Yr)</th>
                <td className="border border-slate-200 px-2 py-1 text-right text-slate-800">{businessCase.introduction.npv5Year || "-"}</td>
              </tr>
              <tr>
                <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">IRR (5 Yr)</th>
                <td className="border border-slate-200 px-2 py-1 text-right text-slate-800">{businessCase.introduction.irr5Year || "-"}</td>
              </tr>
              <tr>
                <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">Payback (Years)</th>
                <td className="border border-slate-200 px-2 py-1 text-right text-slate-800">{businessCase.introduction.paybackYears || "-"}</td>
              </tr>
            </tbody>
          </table>

          <table className="w-full table-fixed border-collapse text-xs">
            <tbody>
              <tr>
                <th className="w-[56%] border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">Capital Expenditure (Total)</th>
                <td className="border border-slate-200 px-2 py-1 text-right text-slate-800">{formatFinancialValue(totalCapital)}</td>
              </tr>
              <tr>
                <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">One-Time Costs (Total)</th>
                <td className="border border-slate-200 px-2 py-1 text-right text-slate-800">{formatFinancialValue(totalOneTime)}</td>
              </tr>
              <tr>
                <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">Current Year Spend</th>
                <td className="border border-slate-200 px-2 py-1 text-right text-slate-800">{formatFinancialValue(currentYearSpend)}</td>
              </tr>
              <tr>
                <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">Current Year Plan</th>
                <td className="border border-slate-200 px-2 py-1 text-right text-slate-800">{formatFinancialValue(currentYearPlan)}</td>
              </tr>
              <tr>
                <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left text-slate-700">Restructuring (HR BAU Funded)</th>
                <td className="border border-slate-200 px-2 py-1 text-right text-slate-800">
                  {formatFinancialValue(
                    businessCase.financialSummary.restructuringHrBauFunded.f2025 +
                      businessCase.financialSummary.restructuringHrBauFunded.f2026 +
                      businessCase.financialSummary.restructuringHrBauFunded.f2027 +
                      businessCase.financialSummary.restructuringHrBauFunded.f2028 +
                      businessCase.financialSummary.restructuringHrBauFunded.f2029 +
                      businessCase.financialSummary.restructuringHrBauFunded.f2030
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {pAndLTotalRows.length > 0 ? (
          <div className="mt-4">
            <h5 className="mb-2 text-sm font-semibold text-slate-900">P&amp;L Impact Totals</h5>
            <table className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="w-[28%] border border-slate-200 px-2 py-1 text-left">Line Item</th>
                  <th className="border border-slate-200 px-2 py-1 text-center">Prior FY(s)</th>
                  <th className="border border-slate-200 px-2 py-1 text-center">Current</th>
                  <th className="border border-slate-200 px-2 py-1 text-center">Y+1</th>
                  <th className="border border-slate-200 px-2 py-1 text-center">Y+2</th>
                  <th className="border border-slate-200 px-2 py-1 text-center">Y+3</th>
                  <th className="border border-slate-200 px-2 py-1 text-center">Y+4</th>
                  <th className="border border-slate-200 px-2 py-1 text-center">Y+5</th>
                  <th className="border border-slate-200 px-2 py-1 text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {pAndLTotalRows.map((row) => (
                  <tr key={`funding-pl-${row.id}`} className="text-slate-700">
                    <td className="border border-slate-200 px-2 py-1">{row.label}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(row.priorFys)}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(row.currentYear)}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(row.yearPlus1)}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(row.yearPlus2)}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(row.yearPlus3)}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(row.yearPlus4)}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(row.yearPlus5)}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center">{formatFinancialValue(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-slate-700">D. Metrics and KPIs</h4>
        {businessCase.metricsAndKpis.length === 0 ? (
          <p className="text-sm text-slate-600">No metrics captured.</p>
        ) : (
          <table className="w-full table-fixed border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="w-[20%] border border-slate-200 px-2 py-1 text-left">Category</th>
                <th className="w-[20%] border border-slate-200 px-2 py-1 text-left">Metric</th>
                <th className="border border-slate-200 px-2 py-1 text-center">Target</th>
                <th className="border border-slate-200 px-2 py-1 text-center">Prior FY(s)</th>
                <th className="border border-slate-200 px-2 py-1 text-center">F2026</th>
                <th className="border border-slate-200 px-2 py-1 text-center">F2027</th>
                <th className="border border-slate-200 px-2 py-1 text-center">F2028</th>
                <th className="border border-slate-200 px-2 py-1 text-center">F2029</th>
                <th className="border border-slate-200 px-2 py-1 text-center">F2030</th>
              </tr>
            </thead>
            <tbody>
              {businessCase.metricsAndKpis.map((metric, index) => (
                <tr key={`funding-kpi-${index}`} className="text-slate-700">
                  <td className="border border-slate-200 px-2 py-1">{metric.keyMetricCategory || "-"}</td>
                  <td className="border border-slate-200 px-2 py-1">{metric.keyMetric || "-"}</td>
                  <td className="border border-slate-200 px-2 py-1 text-center">{metric.targetValue || "-"}</td>
                  <td className="border border-slate-200 px-2 py-1 text-center">{metric.priorFys || "-"}</td>
                  <td className="border border-slate-200 px-2 py-1 text-center">{metric.f2026 || "-"}</td>
                  <td className="border border-slate-200 px-2 py-1 text-center">{metric.f2027 || "-"}</td>
                  <td className="border border-slate-200 px-2 py-1 text-center">{metric.f2028 || "-"}</td>
                  <td className="border border-slate-200 px-2 py-1 text-center">{metric.f2029 || "-"}</td>
                  <td className="border border-slate-200 px-2 py-1 text-center">{metric.f2030 || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
