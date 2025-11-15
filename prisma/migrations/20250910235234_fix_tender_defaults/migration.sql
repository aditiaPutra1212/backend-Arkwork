/*
  Warnings:

  - You are about to drop the column `teamSlots` on the `Tender` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Tender" DROP COLUMN "teamSlots",
ALTER COLUMN "description" SET DEFAULT '',
ALTER COLUMN "documents" SET DEFAULT ARRAY[]::TEXT[];
