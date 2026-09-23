-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('CARD', 'POPUP');

-- AlterTable
ALTER TABLE "banners" ADD COLUMN     "placement" "BannerPlacement" NOT NULL DEFAULT 'CARD',
ADD COLUMN     "testEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
