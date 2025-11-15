-- CreateEnum
CREATE TYPE "public"."BillingStatus" AS ENUM ('none', 'trial', 'active', 'past_due', 'canceled');

-- AlterTable
ALTER TABLE "public"."employers" ADD COLUMN     "billing_status" "public"."BillingStatus" NOT NULL DEFAULT 'none',
ADD COLUMN     "current_plan_id" UUID,
ADD COLUMN     "premium_until" TIMESTAMPTZ(6),
ADD COLUMN     "recurring_token" TEXT,
ADD COLUMN     "trial_ends_at" TIMESTAMPTZ(6),
ADD COLUMN     "trial_started_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "public"."plans" ADD COLUMN     "trialDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."subscriptions" ADD COLUMN     "cancel_at" TIMESTAMP(3),
ADD COLUMN     "canceled_at" TIMESTAMP(3),
ADD COLUMN     "start_at" TIMESTAMP(3),
ADD COLUMN     "trial_ends_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "employers_billing_status_trial_ends_at_idx" ON "public"."employers"("billing_status", "trial_ends_at");

-- CreateIndex
CREATE INDEX "employers_current_plan_id_idx" ON "public"."employers"("current_plan_id");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "public"."subscriptions"("plan_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "public"."subscriptions"("status", "current_period_end");

-- AddForeignKey
ALTER TABLE "public"."employers" ADD CONSTRAINT "employers_current_plan_id_fkey" FOREIGN KEY ("current_plan_id") REFERENCES "public"."plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
