import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const emails = [
  "submitter@test.com",
  "bsponsor@test.com",
  "bdelegate@test.com",
  "fsponsor@test.com",
  "tsponsor@test.com",
  "benefits@test.com",
  "pgov@test.com",
  "fgov@test.com",
  "spo@test.com",
  "pm@test.com",
  "pmadmin@test.com",
  "admin@test.com"
];

const generatePassword = () => {
  const token = randomBytes(6).toString("base64url");
  return `Stg!${token}9`;
};

const main = async () => {
  const credentials = emails.map((email) => ({
    email,
    password: generatePassword()
  }));

  const outputDir = path.join(process.cwd(), "exports");
  await mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, "staging-test-credentials.json");
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        credentials
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Generated ${credentials.length} staging credentials at ${outputPath}`);
};

main().catch((error) => {
  console.error("Unable to generate staging credentials.", error);
  process.exitCode = 1;
});

