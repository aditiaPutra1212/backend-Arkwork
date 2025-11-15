-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."Contract" ADD VALUE 'PSC';
ALTER TYPE "public"."Contract" ADD VALUE 'SERVICE';
ALTER TYPE "public"."Contract" ADD VALUE 'JOC';
ALTER TYPE "public"."Contract" ADD VALUE 'TURNKEY';
ALTER TYPE "public"."Contract" ADD VALUE 'LOGISTICS';
ALTER TYPE "public"."Contract" ADD VALUE 'DRILLING';
ALTER TYPE "public"."Contract" ADD VALUE 'O&M';
