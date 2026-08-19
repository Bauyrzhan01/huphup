-- AlterTable
ALTER TABLE "companies" ADD COLUMN "taskSeq" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "LeadTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "LeadTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "lead_tasks"
  ADD COLUMN "companyId" TEXT,
  ADD COLUMN "code" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "status" "LeadTaskStatus" NOT NULL DEFAULT 'TODO',
  ADD COLUMN "priority" "LeadTaskPriority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "lead_tasks" AS t
SET "companyId" = l."companyId"
FROM "leads" AS l
WHERE l."id" = t."leadId";

UPDATE "lead_tasks"
SET "status" = 'DONE'
WHERE "doneAt" IS NOT NULL;

UPDATE "lead_tasks" AS t
SET "code" = 'T-' || n.n
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt") AS n
  FROM "lead_tasks"
) AS n
WHERE t."id" = n."id";

UPDATE "companies" AS c
SET "taskSeq" = COALESCE((
  SELECT COUNT(*)::int FROM "lead_tasks" AS t WHERE t."companyId" = c."id"
), 0);

ALTER TABLE "lead_tasks" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "lead_tasks" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "lead_tasks_companyId_code_key" ON "lead_tasks"("companyId", "code");
CREATE INDEX "lead_tasks_assigneeId_status_idx" ON "lead_tasks"("assigneeId", "status");
CREATE INDEX "lead_tasks_companyId_status_idx" ON "lead_tasks"("companyId", "status");
DROP INDEX IF EXISTS "lead_tasks_assigneeId_doneAt_idx";

ALTER TABLE "lead_tasks"
  ADD CONSTRAINT "lead_tasks_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "lead_task_comments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_task_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lead_task_comments_taskId_createdAt_idx" ON "lead_task_comments"("taskId", "createdAt");

ALTER TABLE "lead_task_comments"
  ADD CONSTRAINT "lead_task_comments_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "lead_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_task_comments"
  ADD CONSTRAINT "lead_task_comments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
