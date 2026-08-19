-- CreateEnum
CREATE TYPE "LeadTaskKind" AS ENUM ('CALL', 'MEETING', 'TASK');

-- CreateTable
CREATE TABLE "lead_tasks" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "kind" "LeadTaskKind" NOT NULL DEFAULT 'TASK',
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lead_tasks_leadId_dueAt_idx" ON "lead_tasks"("leadId", "dueAt");
CREATE INDEX "lead_tasks_assigneeId_doneAt_idx" ON "lead_tasks"("assigneeId", "doneAt");

ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
