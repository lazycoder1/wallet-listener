/*
  Warnings:

  - You are about to drop the column `channel_id` on the `slack_configurations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "slack_configurations" DROP COLUMN "channel_id",
ADD COLUMN     "webhook_url" TEXT;
