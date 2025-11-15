/*
  Warnings:

  - You are about to drop the `JobReport` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."JobReport" DROP CONSTRAINT "JobReport_jobId_fkey";

-- AlterTable
ALTER TABLE "public"."Job" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "employment" TEXT,
ADD COLUMN     "location" TEXT;

-- DropTable
DROP TABLE "public"."JobReport";

-- CreateTable
CREATE TABLE "public"."job_reports" (
    "id" TEXT NOT NULL,
    "jobId" UUID NOT NULL,
    "reporterUserId" TEXT,
    "reporterEmail" TEXT,
    "reason" "public"."ReportReason" NOT NULL,
    "details" TEXT,
    "evidenceUrl" TEXT,
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'OPEN',
    "action" "public"."ReportAction" NOT NULL DEFAULT 'NONE',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_reports_jobId_status_idx" ON "public"."job_reports"("jobId", "status");

-- CreateIndex
CREATE INDEX "job_reports_status_createdAt_idx" ON "public"."job_reports"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."job_reports" ADD CONSTRAINT "job_reports_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
