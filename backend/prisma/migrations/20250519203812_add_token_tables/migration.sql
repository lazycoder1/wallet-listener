-- CreateTable
CREATE TABLE "token_addresses" (
    "id" SERIAL NOT NULL,
    "token_id" INTEGER NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_addresses_token_id_chain_key" ON "token_addresses"("token_id", "chain");

-- AddForeignKey
ALTER TABLE "token_addresses" ADD CONSTRAINT "token_addresses_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
