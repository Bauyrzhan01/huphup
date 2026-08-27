-- AlterTable
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "matchedProductId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "leads_matchedProductId_idx" ON "leads"("matchedProductId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_matchedProductId_fkey'
  ) THEN
    ALTER TABLE "leads"
      ADD CONSTRAINT "leads_matchedProductId_fkey"
      FOREIGN KEY ("matchedProductId") REFERENCES "products"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
