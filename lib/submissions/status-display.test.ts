import { describe, expect, it } from "vitest";

import { getSubmissionStatusLabel } from "./status-display";

const base = {
  stage: "PGO & Finance Review" as const,
  status: "Submitted" as const,
  workflow: {
    entityType: "PROPOSAL" as const,
    lifecycleStatus: "AT_PGO_FGO_REVIEW" as const,
    sponsorDecision: "Approved" as const,
    pgoDecision: "Pending" as const,
    financeDecision: "Pending" as const,
    spoDecision: "Pending" as const,
    fundingStatus: "Not Requested" as const
  }
};

describe("getSubmissionStatusLabel", () => {
  it("returns stage-specific review label while both reviews are pending", () => {
    expect(getSubmissionStatusLabel(base)).toBe("PGO & Finance Review");
  });

  it("returns reviewer-specific pending labels when one side is complete", () => {
    expect(
      getSubmissionStatusLabel({
        ...base,
        workflow: { ...base.workflow, pgoDecision: "Approved" }
      })
    ).toBe("PGO Review Complete - Finance Pending");

    expect(
      getSubmissionStatusLabel({
        ...base,
        workflow: { ...base.workflow, financeDecision: "Approved" }
      })
    ).toBe("Finance Review Complete - PGO Pending");
  });

  it("falls back to regular status outside PGO and Finance stage", () => {
    expect(
      getSubmissionStatusLabel({
        ...base,
        stage: "Funding Request",
        status: "Approved",
        workflow: {
          ...base.workflow,
          entityType: "FUNDING_REQUEST",
          lifecycleStatus: "FR_APPROVED"
        }
      })
    ).toBe("Funding Approved");
  });

  it("shows At SPO Review label when item is submitted in SPO stage", () => {
    expect(
      getSubmissionStatusLabel({
        ...base,
        stage: "SPO Committee Review",
        status: "Submitted",
        workflow: {
          ...base.workflow,
          lifecycleStatus: "AT_SPO_REVIEW"
        }
      })
    ).toBe("At SPO Review");
  });
});
