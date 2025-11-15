-- CreateEnum
CREATE TYPE "public"."ApplicationStatus" AS ENUM ('submitted', 'review', 'shortlist', 'rejected', 'hired');

-- CreateTable
CREATE TABLE "public"."job_applications" (
    "id" TEXT NOT NULL,
    "jobId" UUID NOT NULL,
    "applicantId" TEXT NOT NULL,
    "status" "public"."ApplicationStatus" NOT NULL DEFAULT 'submitted',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."saved_jobs" (
    "id" TEXT NOT NULL,
    "jobId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_applications_applicantId_idx" ON "public"."job_applications"("applicantId");

-- CreateIndex
CREATE INDEX "job_applications_jobId_idx" ON "public"."job_applications"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "job_applications_jobId_applicantId_key" ON "public"."job_applications"("jobId", "applicantId");

-- CreateIndex
CREATE INDEX "saved_jobs_userId_idx" ON "public"."saved_jobs"("userId");

-- CreateIndex
CREATE INDEX "saved_jobs_jobId_idx" ON "public"."saved_jobs"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_jobs_jobId_userId_key" ON "public"."saved_jobs"("jobId", "userId");

-- AddForeignKey
ALTER TABLE "public"."job_applications" ADD CONSTRAINT "job_applications_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."job_applications" ADD CONSTRAINT "job_applications_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."saved_jobs" ADD CONSTRAINT "saved_jobs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."saved_jobs" ADD CONSTRAINT "saved_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
