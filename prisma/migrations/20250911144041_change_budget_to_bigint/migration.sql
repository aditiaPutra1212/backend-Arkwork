/*
  Warnings:

  - You are about to drop the column `budgetUSD` on the `Tender` table. All the data in the column will be lost.
  - Added the required column `budget_usd` to the `Tender` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Tender" DROP COLUMN "budgetUSD",
ADD COLUMN     "budget_usd" BIGINT NOT NULL;
