-- Сейф-сделка: деньги покупателя лежат у площадки до получения товара.

-- AlterEnum: поводы движения денег по сейф-сделке
ALTER TYPE "BillingReason" ADD VALUE IF NOT EXISTS 'ESCROW_HOLD';
ALTER TYPE "BillingReason" ADD VALUE IF NOT EXISTS 'ESCROW_RELEASE';
ALTER TYPE "BillingReason" ADD VALUE IF NOT EXISTS 'ESCROW_REFUND';

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('AWAITING_PAYMENT', 'HELD', 'SHIPPED', 'RELEASED', 'REFUNDED', 'DISPUTED');

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "commission" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KZT',
    "status" "DealStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "fundedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "autoReleaseAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- Сумма сделки всегда положительная, удержание не больше суммы
ALTER TABLE "deals" ADD CONSTRAINT "deals_amount_positive_check" CHECK ("amount" > 0);
ALTER TABLE "deals" ADD CONSTRAINT "deals_commission_range_check" CHECK ("commission" >= 0 AND "commission" <= "amount");

-- CreateIndex
CREATE UNIQUE INDEX "deals_offerId_key" ON "deals"("offerId");
CREATE INDEX "deals_buyerId_status_idx" ON "deals"("buyerId", "status");
CREATE INDEX "deals_companyId_status_idx" ON "deals"("companyId", "status");
CREATE INDEX "deals_status_autoReleaseAt_idx" ON "deals"("status", "autoReleaseAt");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
