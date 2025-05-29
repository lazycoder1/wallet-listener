-- CreateTable
CREATE TABLE "token_prices" (
    "symbol" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_prices_pkey" PRIMARY KEY ("symbol")
);
