-- AlterTable
ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "daily_reports_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "daily_reports_email" TEXT;


