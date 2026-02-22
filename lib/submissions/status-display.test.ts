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
  it("returns canonical review label while both reviews are pending", () => {
    expect(getSubmissionStatusLabel(base)).toBe("PGO/FGO Review");
  });

  it("returns canonical review label when one reviewer is complete", () => {
    expect(
      getSubmissionStatusLabel({
        ...base,
        workflow: { ...base.workflow, pgoDecision: "Approved" }
      })
    ).toBe("PGO/FGO Review");

    expect(
      getSubmissionStatusLabel({
        ...base,
        workflow: { ...base.workflow, financeDecision: "Approved" }
      })
    ).toBe("PGO/FGO Review");
  });

  it("returns canonical approved label outside PGO/FGO review stage", () => {
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
    ).toBe("Approved");
  });

  it("shows canonical SPO review label when item is submitted in SPO stage", () => {
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
    ).toBe("SPO Review");
  });
});
