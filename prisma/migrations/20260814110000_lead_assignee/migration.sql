-- AlterTable
ALTER TABLE "leads"
ADD COLUMN "assigneeId" TEXT,
ADD COLUMN "claimedAt" TIMESTAMP(3),
ADD COLUMN "lastActorId" TEXT;

-- CreateIndex
CREATE INDEX "leads_assigneeId_idx" ON "leads"("assigneeId");

-- AddForeignKey
ALTER TABLE "leads"
ADD CONSTRAINT "leads_assigneeId_fkey"
FOREIGN KEY ("assigneeId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads"
ADD CONSTRAINT "leads_lastActorId_fkey"
FOREIGN KEY ("lastActorId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
