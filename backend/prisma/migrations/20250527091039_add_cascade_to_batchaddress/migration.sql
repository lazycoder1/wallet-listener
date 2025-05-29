-- DropForeignKey
ALTER TABLE "batch_addresses" DROP CONSTRAINT "batch_addresses_batch_id_fkey";

-- AddForeignKey
ALTER TABLE "batch_addresses" ADD CONSTRAINT "batch_addresses_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
