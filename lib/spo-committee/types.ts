export const SPO_COMMITTEE_DECISIONS = [
  "Deferred",
  "Approved",
  "Request Additional Action"
] as const;

export type SpoCommitteeDecision = (typeof SPO_COMMITTEE_DECISIONS)[number] | "";

export type SpoCommitteeRow = {
  projectId: string;
  projectName: string;
  startDate: string;
  endDate: string;
  businessSponsor: string;
  segmentUnit: string;
  portfolioEsc: string;
  fundingType: string;
  fundingSource: string;
  projectClassification: string;
  projectTheme: string;
  projectCategory: string;
  strategicObjective: string;
  currentFiscalYear: number;
  carryForwardCapex: number;
  carryForwardExpense: number;
  carryForwardTotal: number;
  currentFiscalCapex: number;
  currentFiscalExpense: number;
  currentFiscalTotal: number;
  currentFiscalNibt: number;
  npv5Year: number;
  decision: SpoCommitteeDecision;
  comment: string;
  updatedAt?: string;
};

export type SpoCommitteeVersion = {
  id: string;
  savedAt: string;
  savedByName: string;
  savedByEmail: string;
  rows: SpoCommitteeRow[];
};

export type SpoCommitteeState = {
  rows: SpoCommitteeRow[];
  versions: SpoCommitteeVersion[];
};

export type SpoCommitteeRowUpdate = {
  projectId: string;
  decision: SpoCommitteeDecision;
  comment: string;
};
