-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hiddenAt" TIMESTAMP(3);
