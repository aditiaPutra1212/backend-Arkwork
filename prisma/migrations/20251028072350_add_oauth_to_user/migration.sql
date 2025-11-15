/*
  Warnings:

  - A unique constraint covering the columns `[oauthProvider,oauthId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "oauthId" TEXT,
ADD COLUMN     "oauthProvider" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_oauthProvider_oauthId_key" ON "public"."User"("oauthProvider", "oauthId");

-- CreateIndex
CREATE INDEX "employers_premium_until_idx" ON "public"."employers"("premium_until");

-- CreateIndex
CREATE INDEX "subscriptions_trial_ends_at_idx" ON "public"."subscriptions"("trial_ends_at");
