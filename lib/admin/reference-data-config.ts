export type ReferenceData = {
  executiveSponsors: string[];
  businessSponsors: string[];
  segments: string[];
  projectThemes: string[];
  strategicObjectives: string[];
  classificationTypes: string[];
  enterpriseThemes: string[];
  portfolioEscs: string[];
  projectCategories: string[];
  fundingSources: string[];
  fundingTypes: string[];
  projectImportanceLevels: string[];
  projectComplexityLevels: string[];
  userExperienceImpacts: string[];
  resourceTypes: string[];
  capexOpexTypes: string[];
  availabilityApplicationTiers: string[];
  strategicNonStrategicOptions: string[];
  riskAssessmentRequiredOptions: string[];
  businessUnits: string[];
  opcos: string[];
};

export type ReferenceDataKey = keyof ReferenceData;

export const defaultReferenceData: ReferenceData = {
  executiveSponsors: ["Alex Executive", "Morgan Executive", "Riley Executive", "Taylor Executive"],
  businessSponsors: ["Jordan Sponsor", "Casey Sponsor", "Avery Sponsor", "Drew Sponsor"],
  segments: [
    "PBB - Personal Banking",
    "PBB - Business Banking",
    "PBB - Alternate Channels",
    "PBB - Insurance",
    "PBB - Cards Issuing",
    "CB - Corporate Banking",
    "CB - International Corporate Banking",
    "CB - Investment Banking",
    "CB - Merchant Services",
    "WM - Fund & Trust",
    "WM - Private Wealth",
    "PCB - Human Resources",
    "PCB - Marketing",
    "PCB - Property Services",
    "PCB - Employee Exp. and Client Engage.",
    "PCB - Culture and Change Execution",
    "Finance - Treasury",
    "Finance - Strategy and Economics",
    "Finance - CAD, Reporting, Planning & Tax",
    "Finance - Regulatory Reporting",
    "Risk - Compliance",
    "Risk - Risk Management Services",
    "Risk - Client Credit Management",
    "Risk - Operational Risk",
    "Legal & Corporate Secretary",
    "Transformation, Governance & Control",
    "T&I - Operations",
    "T&I - Enterprise Security & Fraud",
    "T&I - Accounts Payable",
    "T&I - Technology & Infrastructure"
  ],
  projectThemes: ["Innovative", "Business Continuity"],
  strategicObjectives: [
    "Client Relationships",
    "Modern Everyday Client Experience",
    "Simplification",
    "People"
  ],
  classificationTypes: [
    "GRO - Growth",
    "PRO - Productivity",
    "TRAN - Business Transformation",
    "DISC - SBU Discretionary",
    "PS&E - Product & Service Enhancement",
    "MOP - Maintain Operations",
    "EVER - Evergreen",
    "RG 1 - Regulation/Legislation-Enacted",
    "RG 2 - Internal Audit (Escalated Deficiencies)",
    "RG 3 - Regulation/Legislation-Pending"
  ],
  enterpriseThemes: [
    "SGI - Enable & Simplify Our Bank",
    "SBU Discretionary",
    "R&G - Data Governance",
    "R&G - Canadian AML Regulations",
    "R&G - Enterprise Wires Modernization",
    "R&G - RESL Program",
    "R&G - All other R&G",
    "MOPs - Cyber/ InfoSec",
    "MOPs - Technology Currency",
    "MOPs - Real Estate",
    "MOPs - All other MOPs (Maintain Operations)"
  ],
  portfolioEscs: [
    "Cards, Payments & ABM",
    "Digital & Data",
    "Digital Transformation",
    "HR, Finance & Property Services",
    "Technology, Infrastructure & Innovation"
  ],
  projectCategories: ["Technology", "Premise", "Other"],
  fundingSources: ["SPO Projects Fund", "BAU"],
  fundingTypes: ["Seed", "Business Case"],
  projectImportanceLevels: ["Low", "Medium", "High"],
  projectComplexityLevels: ["Low", "Medium", "High"],
  userExperienceImpacts: ["Internal", "External", "Both"],
  resourceTypes: ["Internal", "External"],
  capexOpexTypes: ["CAPEX", "OPEX"],
  availabilityApplicationTiers: ["1 - Critical", "1", "2", "3", "DNR"],
  strategicNonStrategicOptions: ["Strategic", "Non-Strategic"],
  riskAssessmentRequiredOptions: [
    "Yes - CIRA / CIRA Applicability Started",
    "Yes - CIRA / CIRA Applicability Completed",
    "Not Applicable"
  ],
  businessUnits: ["Finance", "Operations", "Technology", "Risk", "HR", "Commercial", "Supply Chain"],
  opcos: ["CIBC Canada", "CIBC US", "CIBC Caribbean", "Corporate"]
};

export const referenceDataLabels: Record<ReferenceDataKey, string> = {
  executiveSponsors: "Executive Sponsors",
  businessSponsors: "Business Sponsors",
  segments: "Segment - Unit",
  projectThemes: "Project Themes",
  strategicObjectives: "Strategic Objectives",
  classificationTypes: "Specific Classification Types",
  enterpriseThemes: "Enterprise Project Themes",
  portfolioEscs: "Portfolio ESC",
  projectCategories: "Project Categories",
  fundingSources: "Funding Sources",
  fundingTypes: "Funding Types",
  projectImportanceLevels: "Project Importance Levels",
  projectComplexityLevels: "Project Complexity Levels",
  userExperienceImpacts: "User Experience Impacts",
  resourceTypes: "Resource Types",
  capexOpexTypes: "CAPEX/OPEX Types",
  availabilityApplicationTiers: "Availability Application Tiers",
  strategicNonStrategicOptions: "Strategic/Non-Strategic Options",
  riskAssessmentRequiredOptions: "Risk Assessment Required Options",
  businessUnits: "Business Units",
  opcos: "OpCos"
};
