/*
  Warnings:

  - Made the column `passwordHash` on table `Admin` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Admin" ALTER COLUMN "passwordHash" SET NOT NULL;

-- AlterTable
ALTER TABLE "public"."User" ALTER COLUMN "passwordHash" DROP NOT NULL;
