import type { RoleType } from "@/lib/auth/roles";

export type TestAccount = {
  key: string;
  name: string;
  email: string;
  password: string;
  jobTitle: string;
  department: string;
  roleType: RoleType;
  azureObjectId: string;
  purpose: string;
};

const sharedPassword = "password123";

export const LOCAL_DEMO_ACCOUNTS: readonly TestAccount[] = [
  {
    key: "submitter-local",
    name: "Sofia Submitter",
    email: "submitter@portal.local",
    password: sharedPassword,
    jobTitle: "Project Analyst",
    department: "Transformation",
    roleType: "BASIC_USER",
    azureObjectId: "11111111-1111-1111-1111-111111111111",
    purpose: "Create and submit proposals"
  },
  {
    key: "reviewer-local",
    name: "Ravi Reviewer",
    email: "reviewer@portal.local",
    password: sharedPassword,
    jobTitle: "Governance Manager",
    department: "Governance",
    roleType: "PROJECT_GOVERNANCE_USER",
    azureObjectId: "33333333-3333-3333-3333-333333333333",
    purpose: "Project Governance testing"
  },
  {
    key: "approver-local",
    name: "Avery Approver",
    email: "approver@portal.local",
    password: sharedPassword,
    jobTitle: "Finance Director",
    department: "Finance",
    roleType: "FINANCE_GOVERNANCE_USER",
    azureObjectId: "22222222-2222-2222-2222-222222222222",
    purpose: "Finance review and approvals"
  },
  {
    key: "admin-local",
    name: "Ada Admin",
    email: "admin@portal.local",
    password: sharedPassword,
    jobTitle: "System Administrator",
    department: "Technology",
    roleType: "ADMIN",
    azureObjectId: "77777777-7777-7777-7777-777777777777",
    purpose: "Full platform administration"
  }
];

export const STAGING_TEST_ACCOUNTS: readonly TestAccount[] = [
  {
    key: "submitter",
    name: "Submitter Tester",
    email: "submitter@test.com",
    password: sharedPassword,
    jobTitle: "Project Analyst",
    department: "Transformation",
    roleType: "BASIC_USER",
    azureObjectId: "a1111111-1111-1111-1111-111111111111",
    purpose: "Creates proposals and funding drafts"
  },
  {
    key: "business-sponsor",
    name: "Business Sponsor",
    email: "bsponsor@test.com",
    password: sharedPassword,
    jobTitle: "Business Executive",
    department: "Business",
    roleType: "BASIC_USER",
    azureObjectId: "a2222222-2222-2222-2222-222222222222",
    purpose: "Business sponsor approvals"
  },
  {
    key: "business-delegate",
    name: "Business Delegate",
    email: "bdelegate@test.com",
    password: sharedPassword,
    jobTitle: "Business Delegate",
    department: "Business",
    roleType: "BASIC_USER",
    azureObjectId: "a3333333-3333-3333-3333-333333333333",
    purpose: "Delegate approvals"
  },
  {
    key: "finance-sponsor",
    name: "Finance Sponsor",
    email: "fsponsor@test.com",
    password: sharedPassword,
    jobTitle: "Finance Sponsor",
    department: "Finance",
    roleType: "BASIC_USER",
    azureObjectId: "a4444444-4444-4444-4444-444444444444",
    purpose: "Funding sponsor approvals"
  },
  {
    key: "technology-sponsor",
    name: "Technology Sponsor",
    email: "tsponsor@test.com",
    password: sharedPassword,
    jobTitle: "Technology Sponsor",
    department: "Technology",
    roleType: "BASIC_USER",
    azureObjectId: "a5555555-5555-5555-5555-555555555555",
    purpose: "Technology approvals"
  },
  {
    key: "benefits-sponsor",
    name: "Benefits Sponsor",
    email: "benefits@test.com",
    password: sharedPassword,
    jobTitle: "Benefits Sponsor",
    department: "Strategy",
    roleType: "BASIC_USER",
    azureObjectId: "a6666666-6666-6666-6666-666666666666",
    purpose: "Benefits approvals"
  },
  {
    key: "project-governance-user",
    name: "Project Governance User",
    email: "pgov@test.com",
    password: sharedPassword,
    jobTitle: "Governance Analyst",
    department: "Governance",
    roleType: "PROJECT_GOVERNANCE_USER",
    azureObjectId: "a7777777-7777-7777-7777-777777777777",
    purpose: "Project Governance Hub reviews"
  },
  {
    key: "finance-governance-user",
    name: "Finance Governance User",
    email: "fgov@test.com",
    password: sharedPassword,
    jobTitle: "Finance Governance Analyst",
    department: "Finance",
    roleType: "FINANCE_GOVERNANCE_USER",
    azureObjectId: "a8888888-8888-8888-8888-888888888888",
    purpose: "Finance Governance Hub reviews"
  },
  {
    key: "spo-committee-user",
    name: "SPO Committee User",
    email: "spo@test.com",
    password: sharedPassword,
    jobTitle: "SPO Committee Analyst",
    department: "SPO",
    roleType: "SPO_COMMITTEE_HUB_USER",
    azureObjectId: "a9999999-9999-9999-9999-999999999999",
    purpose: "SPO committee decisions"
  },
  {
    key: "project-manager",
    name: "Project Manager",
    email: "pm@test.com",
    password: sharedPassword,
    jobTitle: "Project Manager",
    department: "Project Management",
    roleType: "PROJECT_MANAGEMENT_HUB_BASIC_USER",
    azureObjectId: "b1111111-1111-1111-1111-111111111111",
    purpose: "PM assignment approval and delivery view"
  },
  {
    key: "pm-hub-admin",
    name: "PM Hub Admin",
    email: "pmadmin@test.com",
    password: sharedPassword,
    jobTitle: "PM Hub Administrator",
    department: "Project Management",
    roleType: "PROJECT_MANAGEMENT_HUB_ADMIN",
    azureObjectId: "b2222222-2222-2222-2222-222222222222",
    purpose: "PM Hub governance and assignment management"
  },
  {
    key: "admin",
    name: "Admin Tester",
    email: "admin@test.com",
    password: sharedPassword,
    jobTitle: "System Administrator",
    department: "Technology",
    roleType: "ADMIN",
    azureObjectId: "b3333333-3333-3333-3333-333333333333",
    purpose: "Full administration and emergency override testing"
  }
];

