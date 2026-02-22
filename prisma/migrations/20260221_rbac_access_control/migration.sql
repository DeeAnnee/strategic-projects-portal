CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RoleType') THEN
    CREATE TYPE "RoleType" AS ENUM (
      'BASIC_USER',
      'FINANCE_GOVERNANCE_USER',
      'PROJECT_GOVERNANCE_USER',
      'SPO_COMMITTEE_HUB_USER',
      'PROJECT_MANAGEMENT_HUB_ADMIN',
      'PROJECT_MANAGEMENT_HUB_BASIC_USER',
      'ADMIN'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApprovalStage') THEN
    CREATE TYPE "ApprovalStage" AS ENUM ('BUSINESS', 'TECHNOLOGY', 'FINANCE', 'BENEFITS');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApprovalStatus') THEN
    CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApprovalActingAs') THEN
    CREATE TYPE "ApprovalActingAs" AS ENUM ('SPONSOR', 'DELEGATE');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "azureObjectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "jobTitle" TEXT,
  "department" TEXT,
  "roleType" "RoleType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "passwordHash" TEXT,
  "photoUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_azureObjectId_key" ON "User"("azureObjectId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByUserId" UUID,
  ADD COLUMN IF NOT EXISTS "businessSponsorObjectId" TEXT,
  ADD COLUMN IF NOT EXISTS "businessDelegateObjectId" TEXT,
  ADD COLUMN IF NOT EXISTS "technologySponsorObjectId" TEXT,
  ADD COLUMN IF NOT EXISTS "financeSponsorObjectId" TEXT,
  ADD COLUMN IF NOT EXISTS "benefitsSponsorObjectId" TEXT;

UPDATE "Project"
SET "title" = COALESCE("title", "name")
WHERE "title" IS NULL;

ALTER TABLE "Project"
  ALTER COLUMN "title" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Project_ownerEmail_idx" ON "Project"("ownerEmail");
CREATE INDEX IF NOT EXISTS "Project_createdByUserId_idx" ON "Project"("createdByUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Project_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "Project"
      ADD CONSTRAINT "Project_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "ProjectAssignment" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "assignmentType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ProjectAssignment_projectId_idx" ON "ProjectAssignment"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectAssignment_userId_idx" ON "ProjectAssignment"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectAssignment_project_user_assignment_key"
  ON "ProjectAssignment"("projectId", "userId", "assignmentType");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectAssignment_projectId_fkey'
  ) THEN
    ALTER TABLE "ProjectAssignment"
      ADD CONSTRAINT "ProjectAssignment_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectAssignment_userId_fkey'
  ) THEN
    ALTER TABLE "ProjectAssignment"
      ADD CONSTRAINT "ProjectAssignment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "Approval" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "stage" "ApprovalStage" NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "decidedByUserId" UUID,
  "actingAs" "ApprovalActingAs",
  "comment" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Approval_projectId_stage_idx" ON "Approval"("projectId", "stage");
CREATE INDEX IF NOT EXISTS "Approval_status_stage_idx" ON "Approval"("status", "stage");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Approval_projectId_fkey'
  ) THEN
    ALTER TABLE "Approval"
      ADD CONSTRAINT "Approval_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Approval_decidedByUserId_fkey'
  ) THEN
    ALTER TABLE "Approval"
      ADD CONSTRAINT "Approval_decidedByUserId_fkey"
      FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "actorUserId" UUID,
  "projectId" TEXT,
  "actionType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "oldValue" JSONB,
  "newValue" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_actorUserId_fkey'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_projectId_fkey'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
