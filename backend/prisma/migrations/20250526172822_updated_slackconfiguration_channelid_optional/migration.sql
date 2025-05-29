/*
  Warnings:

  - You are about to drop the column `webhook_url` on the `slack_configurations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "slack_configurations" DROP COLUMN "webhook_url",
ADD COLUMN     "channel_id" TEXT;
