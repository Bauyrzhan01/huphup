-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('CREATED', 'VIEWED', 'CLAIMED', 'REASSIGNED', 'STATUS_CHANGED', 'OFFER_SENT', 'SKIPPED', 'NOTE_ADDED', 'NEXT_STEP_SET');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "matchReason" TEXT,
ADD COLUMN "nextStepAt" TIMESTAMP(3),
ADD COLUMN "nextStepText" TEXT,
ADD COLUMN "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "LeadActivityType" NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lead_notes" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_stage_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_stage_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_automation_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_statusChangedAt_idx" ON "leads"("statusChangedAt");
CREATE INDEX "lead_activities_leadId_createdAt_idx" ON "lead_activities"("leadId", "createdAt");
CREATE INDEX "lead_notes_leadId_createdAt_idx" ON "lead_notes"("leadId", "createdAt");
CREATE UNIQUE INDEX "crm_stage_configs_companyId_status_key" ON "crm_stage_configs"("companyId", "status");
CREATE INDEX "crm_stage_configs_companyId_sortOrder_idx" ON "crm_stage_configs"("companyId", "sortOrder");
CREATE INDEX "crm_automation_rules_companyId_enabled_idx" ON "crm_automation_rules"("companyId", "enabled");

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_stage_configs" ADD CONSTRAINT "crm_stage_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_automation_rules" ADD CONSTRAINT "crm_automation_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill statusChangedAt for existing leads
UPDATE "leads" SET "statusChangedAt" = COALESCE("claimedAt", "updatedAt", "createdAt");
