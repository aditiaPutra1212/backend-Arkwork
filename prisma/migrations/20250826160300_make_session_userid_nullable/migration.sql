-- CreateEnum
CREATE TYPE "public"."Sector" AS ENUM ('OIL_GAS', 'RENEWABLE_ENERGY', 'UTILITIES', 'ENGINEERING');

-- CreateEnum
CREATE TYPE "public"."Status" AS ENUM ('OPEN', 'PREQUALIFICATION', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."Contract" AS ENUM ('EPC', 'SUPPLY', 'CONSULTING', 'MAINTENANCE');

-- AlterTable
ALTER TABLE "public"."employer_profiles" ADD COLUMN     "facebook" TEXT,
ADD COLUMN     "youtube" TEXT;

-- AlterTable
ALTER TABLE "public"."sessions" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."Tender" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "sector" "public"."Sector" NOT NULL,
    "location" TEXT NOT NULL,
    "status" "public"."Status" NOT NULL,
    "contract" "public"."Contract" NOT NULL,
    "budgetUSD" INTEGER NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "teamSlots" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "documents" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);
