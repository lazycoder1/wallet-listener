/*
  Warnings:

  - You are about to drop the column `organization_details` on the `slack_configurations` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[slack_team_id]` on the table `slack_configurations` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "slack_configurations" DROP CONSTRAINT "slack_configurations_company_id_fkey";

-- AlterTable
ALTER TABLE "slack_configurations" DROP COLUMN "organization_details",
ADD COLUMN     "access_token" TEXT,
ADD COLUMN     "bot_user_id" TEXT,
ADD COLUMN     "installation_status" TEXT NOT NULL DEFAULT 'pending_link',
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "raw_oauth_response" JSONB,
ADD COLUMN     "scopes" TEXT,
ADD COLUMN     "slack_app_id" TEXT,
ADD COLUMN     "slack_team_id" TEXT NOT NULL DEFAULT 'TEMP_TEAM_ID',
ADD COLUMN     "slack_team_name" TEXT,
ALTER COLUMN "company_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "slack_configurations_slack_team_id_key" ON "slack_configurations"("slack_team_id");

-- AddForeignKey
ALTER TABLE "slack_configurations" ADD CONSTRAINT "slack_configurations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
