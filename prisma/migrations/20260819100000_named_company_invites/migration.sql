-- AlterTable
ALTER TABLE "company_invites" ADD COLUMN IF NOT EXISTS "email" TEXT NOT NULL DEFAULT '';
ALTER TABLE "company_invites" ADD COLUMN IF NOT EXISTS "role" "CompanyMemberRole" NOT NULL DEFAULT 'MANAGER';
ALTER TABLE "company_invites" ADD COLUMN IF NOT EXISTS "title" TEXT;

CREATE INDEX IF NOT EXISTS "company_invites_email_idx" ON "company_invites"("email");
