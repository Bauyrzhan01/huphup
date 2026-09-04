-- CreateIndex
-- Supports the public landing feed: ORDER BY "createdAt" DESC LIMIT n
CREATE INDEX IF NOT EXISTS "requests_createdAt_idx" ON "requests"("createdAt");
