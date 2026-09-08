-- Расширяет существующие кошельки (20260903120000_user_wallets) до биллинга:
-- кошельки компаний, повод списания, защита от двойного списания и прайс-лист.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LOW_BALANCE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BILLING';

-- CreateEnum
CREATE TYPE "BillingReason" AS ENUM ('LEAD_UNLOCK', 'OFFER_SENT', 'SUBSCRIPTION', 'DEAL_COMMISSION', 'MANUAL');

-- AlterTable: кошелёк может принадлежать компании, а не только пользователю
ALTER TABLE "wallets" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "lowBalanceNotifiedAt" TIMESTAMP(3);

-- Владелец ровно один: компания или пользователь
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_single_owner_check"
    CHECK (("companyId" IS NOT NULL) <> ("userId" IS NOT NULL));

-- AlterTable: проводка знает, за что списано, и защищена от повтора
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "reason" "BillingReason";
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "leadId" TEXT;
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "offerId" TEXT;
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "requestId" TEXT;
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "meta" JSONB;

-- Автоматическое списание происходит без администратора
ALTER TABLE "wallet_transactions" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_createdById_fkey";
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "platform_prices" (
    "id" TEXT NOT NULL,
    "reason" "BillingReason" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "percent" DECIMAL(5,2),
    "currency" TEXT NOT NULL DEFAULT 'KZT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_prices" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reason" "BillingReason" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "percent" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallets_companyId_key" ON "wallets"("companyId");
CREATE UNIQUE INDEX "wallet_transactions_idempotencyKey_key" ON "wallet_transactions"("idempotencyKey");
CREATE INDEX "wallet_transactions_reason_idx" ON "wallet_transactions"("reason");
CREATE UNIQUE INDEX "platform_prices_reason_key" ON "platform_prices"("reason");
CREATE UNIQUE INDEX "company_prices_companyId_reason_key" ON "company_prices"("companyId", "reason");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_prices" ADD CONSTRAINT "company_prices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
