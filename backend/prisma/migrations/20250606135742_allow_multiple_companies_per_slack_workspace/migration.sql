/*
  Warnings:

  - Made the column `company_id` on table `slack_configurations` required. This step will fail if there are existing NULL values in that column.
  - Made the column `slack_team_id` on table `slack_configurations` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "slack_configurations" DROP CONSTRAINT "slack_configurations_company_id_fkey";

-- DropIndex
DROP INDEX "slack_configurations_slack_team_id_key";

-- AlterTable
ALTER TABLE "slack_configurations" ALTER COLUMN "company_id" SET NOT NULL,
ALTER COLUMN "slack_team_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "slack_configurations_slack_team_id_idx" ON "slack_configurations"("slack_team_id");

-- AddForeignKey
ALTER TABLE "slack_configurations" ADD CONSTRAINT "slack_configurations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
