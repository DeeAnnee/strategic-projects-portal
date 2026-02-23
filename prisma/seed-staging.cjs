const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const STAGING_TEST_ACCOUNTS = [
  {
    name: "Submitter Tester",
    email: "submitter@test.com",
    jobTitle: "Project Analyst",
    department: "Transformation",
    roleType: "BASIC_USER",
    azureObjectId: "a1111111-1111-1111-1111-111111111111"
  },
  {
    name: "Business Sponsor",
    email: "bsponsor@test.com",
    jobTitle: "Business Executive",
    department: "Business",
    roleType: "BASIC_USER",
    azureObjectId: "a2222222-2222-2222-2222-222222222222"
  },
  {
    name: "Business Delegate",
    email: "bdelegate@test.com",
    jobTitle: "Business Delegate",
    department: "Business",
    roleType: "BASIC_USER",
    azureObjectId: "a3333333-3333-3333-3333-333333333333"
  },
  {
    name: "Finance Sponsor",
    email: "fsponsor@test.com",
    jobTitle: "Finance Sponsor",
    department: "Finance",
    roleType: "BASIC_USER",
    azureObjectId: "a4444444-4444-4444-4444-444444444444"
  },
  {
    name: "Technology Sponsor",
    email: "tsponsor@test.com",
    jobTitle: "Technology Sponsor",
    department: "Technology",
    roleType: "BASIC_USER",
    azureObjectId: "a5555555-5555-5555-5555-555555555555"
  },
  {
    name: "Benefits Sponsor",
    email: "benefits@test.com",
    jobTitle: "Benefits Sponsor",
    department: "Strategy",
    roleType: "BASIC_USER",
    azureObjectId: "a6666666-6666-6666-6666-666666666666"
  },
  {
    name: "Project Governance User",
    email: "pgov@test.com",
    jobTitle: "Governance Analyst",
    department: "Governance",
    roleType: "PROJECT_GOVERNANCE_USER",
    azureObjectId: "a7777777-7777-7777-7777-777777777777"
  },
  {
    name: "Finance Governance User",
    email: "fgov@test.com",
    jobTitle: "Finance Governance Analyst",
    department: "Finance",
    roleType: "FINANCE_GOVERNANCE_USER",
    azureObjectId: "a8888888-8888-8888-8888-888888888888"
  },
  {
    name: "SPO Committee User",
    email: "spo@test.com",
    jobTitle: "SPO Committee Analyst",
    department: "SPO",
    roleType: "SPO_COMMITTEE_HUB_USER",
    azureObjectId: "a9999999-9999-9999-9999-999999999999"
  },
  {
    name: "Project Manager",
    email: "pm@test.com",
    jobTitle: "Project Manager",
    department: "Project Management",
    roleType: "PROJECT_MANAGEMENT_HUB_BASIC_USER",
    azureObjectId: "b1111111-1111-1111-1111-111111111111"
  },
  {
    name: "PM Hub Admin",
    email: "pmadmin@test.com",
    jobTitle: "PM Hub Administrator",
    department: "Project Management",
    roleType: "PROJECT_MANAGEMENT_HUB_ADMIN",
    azureObjectId: "b2222222-2222-2222-2222-222222222222"
  },
  {
    name: "Admin Tester",
    email: "admin@test.com",
    jobTitle: "System Administrator",
    department: "Technology",
    roleType: "ADMIN",
    azureObjectId: "b3333333-3333-3333-3333-333333333333"
  }
];

const isStaging = () => (process.env.APP_ENV ?? "").trim().toLowerCase() === "staging";

async function main() {
  if (!isStaging()) {
    console.warn(
      "Skipping staging seed because APP_ENV is not set to 'staging'. Set APP_ENV=staging to seed staging users."
    );
    return;
  }

  for (const account of STAGING_TEST_ACCOUNTS) {
    await prisma.user.upsert({
      where: { email: account.email.toLowerCase() },
      update: {
        azureObjectId: account.azureObjectId,
        name: account.name,
        jobTitle: account.jobTitle,
        department: account.department,
        roleType: account.roleType,
        isActive: true,
        passwordHash: "staging-managed-credential"
      },
      create: {
        azureObjectId: account.azureObjectId,
        name: account.name,
        email: account.email.toLowerCase(),
        jobTitle: account.jobTitle,
        department: account.department,
        roleType: account.roleType,
        isActive: true,
        passwordHash: "staging-managed-credential"
      }
    });
  }

  console.log(`Staging seed complete: ${STAGING_TEST_ACCOUNTS.length} users upserted.`);
}

main()
  .catch((error) => {
    console.error("Staging seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
