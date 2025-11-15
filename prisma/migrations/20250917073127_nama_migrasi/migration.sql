/*
  Warnings:

  - You are about to drop the `reports` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "public"."reports";

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "perusahaan" TEXT NOT NULL,
    "alasan" TEXT,
    "catatan" TEXT,
    "status" TEXT NOT NULL DEFAULT 'baru',
    "dibuatPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "public"."Report"("status");
