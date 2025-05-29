/*
  Warnings:

  - You are about to drop the `token_prices` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "token_prices";

-- CreateTable
CREATE TABLE "tokens" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "price" DECIMAL(65,30),
    "last_price_update" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_symbol_key" ON "tokens"("symbol");
