-- CreateTable
CREATE TABLE "slack_oauth_states" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slack_oauth_states_state_key" ON "slack_oauth_states"("state");

-- CreateIndex
CREATE INDEX "slack_oauth_states_company_id_idx" ON "slack_oauth_states"("company_id");

-- CreateIndex
CREATE INDEX "slack_oauth_states_expires_at_idx" ON "slack_oauth_states"("expires_at");
