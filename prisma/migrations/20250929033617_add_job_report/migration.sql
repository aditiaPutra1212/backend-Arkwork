/*
  Warnings:

  - You are about to drop the `Report` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `jobs` table. If the table is not empty, all the data it contains will be lost.

*/

-- CreateEnum
CREATE TYPE "public"."ReportReason" AS ENUM ('SCAM', 'PHISHING', 'DUPLICATE', 'MISLEADING', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'DISMISSED', 'ACTION_TAKEN');

-- CreateEnum
CREATE TYPE "public"."ReportAction" AS ENUM ('NONE', 'HIDE_JOB', 'DELETE_JOB', 'BLOCK_EMPLOYER');

-- DropForeignKey
ALTER TABLE "public"."job_applications" DROP CONSTRAINT "job_applications_jobId_fkey";

-- DropForeignKey
ALTER TABLE "public"."jobs" DROP CONSTRAINT "jobs_employer_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."saved_jobs" DROP CONSTRAINT "saved_jobs_jobId_fkey";

-- AlterTable
ALTER TABLE "public"."Tender" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."employers" ADD COLUMN "blockedAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "public"."Report";

-- DropTable
DROP TABLE "public"."jobs";

-- CreateTable
CREATE TABLE "public"."Job" (
  "id" UUID NOT NULL,
  "employerId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDraft" BOOLEAN NOT NULL DEFAULT false,
  "isHidden" BOOLEAN NOT NULL DEFAULT false,
  "hiddenReason" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "salary_min" INTEGER,
  "salary_max" INTEGER,
  "currency" TEXT DEFAULT 'IDR',
  "remote_mode" "public"."RemoteMode" DEFAULT 'ON_SITE',
  "exp_min_years" INTEGER,
  "education" "public"."Education",
  "deadline" TIMESTAMP(3),
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "requirements" TEXT,

  CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable (FIXED TYPES)
CREATE TABLE "public"."JobReport" (
  "id" UUID NOT NULL,
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
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "JobReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_employerId_isActive_idx" ON "public"."Job"("employerId", "isActive");

-- CreateIndex
CREATE INDEX "Job_createdAt_idx" ON "public"."Job"("createdAt");

-- CreateIndex
CREATE INDEX "JobReport_jobId_status_idx" ON "public"."JobReport"("jobId", "status");

-- CreateIndex
CREATE INDEX "JobReport_status_createdAt_idx" ON "public"."JobReport"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."Job"
  ADD CONSTRAINT "Job_employerId_fkey"
  FOREIGN KEY ("employerId") REFERENCES "public"."employers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."job_applications"
  ADD CONSTRAINT "job_applications_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."saved_jobs"
  ADD CONSTRAINT "saved_jobs_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (FIXED TYPES)
ALTER TABLE "public"."JobReport"
  ADD CONSTRAINT "JobReport_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
