import { PrismaClient } from "@prisma/client";

import { STAGING_TEST_ACCOUNTS } from "../lib/staging/test-accounts";

const prisma = new PrismaClient();

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

