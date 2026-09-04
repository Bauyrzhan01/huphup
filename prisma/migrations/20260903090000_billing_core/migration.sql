-- AlterEnum: уведомления о балансе
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LOW_BALANCE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BILLING';

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('TOPUP', 'CHARGE', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BillingReason" AS ENUM ('LEAD_UNLOCK', 'OFFER_SENT', 'SUBSCRIPTION', 'DEAL_COMMISSION', 'MANUAL');

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KZT',
    "lowBalanceNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- Владелец кошелька — ровно одна сторона: компания или пользователь
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_single_owner_check"
    CHECK (("companyId" IS NOT NULL) <> ("userId" IS NOT NULL));

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "reason" "BillingReason",
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "leadId" TEXT,
    "offerId" TEXT,
    "requestId" TEXT,
    "createdById" TEXT,
    "comment" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");
CREATE UNIQUE INDEX "wallet_transactions_idempotencyKey_key" ON "wallet_transactions"("idempotencyKey");
CREATE INDEX "wallet_transactions_walletId_createdAt_idx" ON "wallet_transactions"("walletId", "createdAt");
CREATE INDEX "wallet_transactions_reason_idx" ON "wallet_transactions"("reason");
CREATE UNIQUE INDEX "platform_prices_reason_key" ON "platform_prices"("reason");
CREATE UNIQUE INDEX "company_prices_companyId_reason_key" ON "company_prices"("companyId", "reason");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_prices" ADD CONSTRAINT "company_prices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
