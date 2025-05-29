-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_company_id_fkey";

-- DropForeignKey
ALTER TABLE "company_addresses" DROP CONSTRAINT "company_addresses_address_id_fkey";

-- DropForeignKey
ALTER TABLE "company_addresses" DROP CONSTRAINT "company_addresses_company_id_fkey";

-- DropForeignKey
ALTER TABLE "import_batches" DROP CONSTRAINT "import_batches_company_id_fkey";

-- DropForeignKey
ALTER TABLE "slack_configurations" DROP CONSTRAINT "slack_configurations_company_id_fkey";

-- AddForeignKey
ALTER TABLE "company_addresses" ADD CONSTRAINT "company_addresses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_addresses" ADD CONSTRAINT "company_addresses_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_configurations" ADD CONSTRAINT "slack_configurations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
