-- CreateTable
CREATE TABLE "notification_logs" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "time_sent" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_logs_company_id_time_sent_idx" ON "notification_logs"("company_id", "time_sent" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_company_id_kind_time_sent_key" ON "notification_logs"("company_id", "kind", "time_sent");

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
