-- CreateEnum
CREATE TYPE "public"."RemoteMode" AS ENUM ('ON_SITE', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "public"."Education" AS ENUM ('SMA/SMK', 'D3', 'S1', 'S2', 'S3');

-- AlterTable
ALTER TABLE "public"."job_applications" ADD COLUMN     "cv_file_name" TEXT,
ADD COLUMN     "cv_file_size" INTEGER,
ADD COLUMN     "cv_file_type" TEXT,
ADD COLUMN     "cv_url" TEXT;

-- AlterTable
ALTER TABLE "public"."jobs" ADD COLUMN     "currency" TEXT DEFAULT 'IDR',
ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "education" "public"."Education",
ADD COLUMN     "exp_min_years" INTEGER,
ADD COLUMN     "remote_mode" "public"."RemoteMode" DEFAULT 'ON_SITE',
ADD COLUMN     "requirements" TEXT,
ADD COLUMN     "salary_max" INTEGER,
ADD COLUMN     "salary_min" INTEGER,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "jobs_created_at_idx" ON "public"."jobs"("created_at");
