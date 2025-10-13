-- AlterTable
ALTER TABLE "public"."Feed" ADD COLUMN     "productCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settings" JSONB,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "variantCount" INTEGER NOT NULL DEFAULT 0;
