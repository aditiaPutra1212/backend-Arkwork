/*
  Warnings:

  - You are about to drop the `user_profiles` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."user_profiles" DROP CONSTRAINT "user_profiles_userId_fkey";

-- AlterTable
ALTER TABLE "public"."Tender" ADD COLUMN     "teamSlots" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "public"."user_profiles";

-- CreateTable
CREATE TABLE "public"."reports" (
    "id" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "perusahaan" TEXT NOT NULL,
    "alasan" TEXT NOT NULL,
    "catatan" TEXT,
    "status" TEXT NOT NULL DEFAULT 'baru',
    "dibuatPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "public"."reports"("status");
