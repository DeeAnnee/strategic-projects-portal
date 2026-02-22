import type { ProjectSubmission } from "@/lib/submissions/types";

type HelperRequest = {
  question: string;
  submission?: ProjectSubmission | null;
};

export type HelperResponse = {
  answer: string;
  recommendations: string[];
  riskFlags: string[];
};

const lower = (value: string) => value.toLowerCase();

const summarizeSubmission = (submission: ProjectSubmission) => {
  const totalInvestment =
    submission.financials.capex + submission.financials.opex + submission.financials.oneTimeCosts;
  const netImpact = submission.financials.runRateSavings - submission.financials.opex;

  return [
    `Case ${submission.id}: ${submission.title}`,
    `Category: ${submission.category} | Request Type: ${submission.requestType}`,
    `Status/Stage: ${submission.status} / ${submission.stage}`,
    `Total investment: $${totalInvestment.toLocaleString()} | Net annual impact: $${netImpact.toLocaleString()}`
  ].join("\n");
};

const deriveRiskFlags = (submission: ProjectSubmission): string[] => {
  const flags: string[] = [];
  const f = submission.financials;

  if (f.runRateSavings <= f.opex) {
    flags.push("Run-rate savings are less than or equal to annual OPEX.");
  }
  if (f.paybackMonths > 36) {
    flags.push("Payback period is greater than 36 months.");
  }
  if (f.capex + f.oneTimeCosts > 2_000_000) {
    flags.push("Upfront investment is above $2M; expect stronger governance scrutiny.");
  }
  if (!submission.ownerEmail || !submission.ownerEmail.includes("@")) {
    flags.push("Owner email appears missing or invalid.");
  }

  return flags;
};

const recommendNextActions = (submission: ProjectSubmission): string[] => {
  const actions: string[] = [];

  if (submission.status === "Draft") {
    actions.push("Finalize mandatory fields and submit the case for review.");
  }

  if (submission.status === "Submitted" || submission.stage === "Placemat Proposal") {
    actions.push("Route case to business sponsor and validate assumptions before Request Funding stage.");
  }

  if (submission.stage === "Funding Request") {
    actions.push("Attach detailed cost model and sensitivity scenarios for sponsor and finance approval readiness.");
  }

  if (submission.status === "Sent for Approval") {
    actions.push("Set a decision SLA and trigger reminder notifications for stale reviews.");
  }

  if (actions.length === 0) {
    actions.push("No blockers detected. Continue to next configured stage transition.");
  }

  return actions;
};

export const generateHelperResponse = ({ question, submission }: HelperRequest): HelperResponse => {
  const q = lower(question.trim());

  if (!submission) {
    return {
      answer:
        "I can help with strategic-project guidance. Select a CaseID for specific analysis, or ask portfolio-level questions.",
      recommendations: [
        "Choose a project case for detailed financial and risk analysis.",
        "Ask for stage readiness, risk summary, or executive briefing draft."
      ],
      riskFlags: []
    };
  }

  const riskFlags = deriveRiskFlags(submission);
  const recommendations = recommendNextActions(submission);

  if (q.includes("summary") || q.includes("brief") || q.includes("overview")) {
    return {
      answer: summarizeSubmission(submission),
      recommendations,
      riskFlags
    };
  }

  if (q.includes("risk") || q.includes("red flag") || q.includes("issue")) {
    return {
      answer:
        riskFlags.length > 0
          ? `Identified ${riskFlags.length} risk flags for ${submission.id}.`
          : `No major risk flags detected for ${submission.id} based on current data.`,
      recommendations,
      riskFlags
    };
  }

  if (q.includes("financial") || q.includes("payback") || q.includes("npv")) {
    const f = submission.financials;
    return {
      answer: `Financial check for ${submission.id}: CAPEX $${f.capex.toLocaleString()}, OPEX $${f.opex.toLocaleString()}, one-time costs $${f.oneTimeCosts.toLocaleString()}, run-rate savings $${f.runRateSavings.toLocaleString()}, payback ${f.paybackMonths} months.` +
        (typeof f.npv === "number" ? ` NPV: $${f.npv.toLocaleString()}.` : " NPV not provided."),
      recommendations,
      riskFlags
    };
  }

  return {
    answer:
      `For ${submission.id}, I recommend validating financial assumptions, confirming stage-gate readiness, and documenting dependencies before moving forward.`,
    recommendations,
    riskFlags
  };
};
