# TODO: 5-Day MVP Plan (Condensing Weeks 1-2 from Scope)

This plan outlines tasks to achieve the core deliverables of Weeks 1 and 2 (as per `scope.md`) within an accelerated 5-day timeline. It prioritizes a functional end-to-end system for EVM (one chain initially) and Tron, including basic alerts and data export.

**Key:**
*   `[DB]` - Database-related task (Prisma schema, queries)
*   `[EVM]` - EVM chain specific (Ethereum, BSC, or Polygon)
*   `[TRON]` - Tron network specific
*   `[CORE]` - Core backend logic, not chain-specific
*   `[ALERT]` - Alerting system (Slack)
*   `[ADMIN]` - Admin panel / UI related (Next.js)
*   `[TEST]` - Testing

--- 

### **Day 1: Foundation & EVM Core Tracking**

*   **[DB] Define Final Prisma Schema:** Review `prisma/schema.prisma` against `DB_DESIGN.md`. Make any final adjustments for companies, addresses, company_addresses, import_batches, and slack_configurations (focus on fields needed for MVP alerts). Run migrations. (Target: `scope.md` - Week 1 - Define PostgreSQL schema)
*   **[CORE] Implement Real `fetchAddressesFromDB`:** Replace the mock in `WsConnectionManager` with actual Prisma queries to fetch active addresses from `company_addresses` joined with `addresses`. (Target: `scope.md` - Week 1 - Connect WS subscribers)
*   **[EVM] Verify EVM Native & ERC20 Event Subscription:** Thoroughly test `EvmConnectionManager` with a few known addresses on one EVM chain (e.g., Sepolia/Mumbai). Ensure `UnifiedTransferEvent`s are correctly generated for both native and ERC20 transfers to these addresses. (Target: `scope.md` - Week 1 - Listener service to record events)
*   **[CORE] Basic `wsEventHandler.ts` Structure:** Create `wsEventHandler.ts`. Implement a simple `handleWebSocketEvent` function that logs the received `UnifiedTransferEvent` to the console. Wire this up in your main application entry point (e.g., `backend/src/index.ts` or similar) by setting it as the handler for `WsConnectionManager`. (Target: `scope.md` - Week 1 - Listener service to record events)

--- 

### **Day 2: Tron Core Tracking & Basic Event Persistence**

*   **[TRON] `TronConnectionManager` - Skeleton & Connection:** Create `TronConnectionManager` class. Implement constructor, `start()`, `stop()`, and `updateTrackedAddresses()` methods similar to `EvmConnectionManager`. Establish a basic WebSocket connection to TronGrid (or chosen provider). (Target: `scope.md` - Week 1 - Connect WS subscribers to TronGrid)
*   **[TRON] `TronConnectionManager` - TRX (Native) Transfer Subscription:** Implement logic to subscribe to and filter native TRX transfers to tracked addresses. Emit `UnifiedTransferEvent` (type NATIVE) to the event handler. (Target: `scope.md` - Week 1 - Listener service to record events)
*   **[TRON] `TronConnectionManager` - TRC20 Transfer Subscription:** Implement logic to subscribe to and filter TRC20 `Transfer` events to tracked addresses. Emit `UnifiedTransferEvent` (type ERC20, adapting fields for Tron) to the event handler. (Target: `scope.md` - Week 1 - Listener service to record events)
*   **[CORE] Integrate `TronConnectionManager` into `WsConnectionManager`:** Instantiate and manage `TronConnectionManager` within `WsConnectionManager` alongside `EvmConnectionManager`.
*   **[DB] Basic Event Persistence in `wsEventHandler.ts`:** Modify `handleWebSocketEvent` to write key details of the received `UnifiedTransferEvent` (e.g., from, to, value, chainId, type, transactionHash, blockNumber) into a new Prisma model, say `WalletTransaction` or `TrackedTransfer`. Keep it simple for now. (Target: `scope.md` - Week 1 - Persist ... incoming transfer events in PostgreSQL)

--- 

### **Day 3: Alerts & Company Tagging/Context**

*   **[DB] `Alerts` Table & Slack Config:** Ensure `Alerts` table (for logging sent alerts) and `SlackConfiguration` table (for per-company webhook URL, channel, threshold) are correctly defined in Prisma and migrated.
*   **[CORE] `AddressMetadataManager` (or enhance `AddressManager`):** Design a way to quickly fetch company ID, alert threshold, and Slack webhook URL when a transfer to a tracked address is detected. This might involve:
    *   A new `AddressMetadataManager` that caches this info, updated alongside `AddressManager`.
    *   Or, `wsEventHandler` querying the DB using the `to` address and `chainId` from the event to find the `company_id` via `company_addresses` and then the `SlackConfiguration`.
*   **[ALERT] Basic Slack Notifier Service:** Create `SlackNotifier` service (`backend/src/services/notification/slackNotifier.ts`). Implement a method `sendAlert(webhookUrl: string, message: string)` using a simple HTTP client (e.g., `axios` or `node-fetch`) to post to a Slack webhook. (Target: `scope.md` - Week 2 - Integrate Slack Webhook)
*   **[ALERT] Trigger Formatted Alerts in `wsEventHandler.ts`:** When an event is processed in `wsEventHandler.ts`:
    1.  Fetch associated company and Slack configuration (using the mechanism from step 2).
    2.  Check if the transfer value meets the company's alert threshold.
    3.  If yes, construct a formatted message and use `SlackNotifier` to send it.
    4.  Log the alert in the `Alerts` table. (Target: `scope.md` - Week 2 - Trigger formatted alerts)

--- 

### **Day 4: Bulk Import & Admin Panel Basics**

*   **[DB] `ImportBatches` & `Company` Models:** Ensure `ImportBatches` and `Company` tables are correctly defined in Prisma and migrated, including fields for company tagging during import.
*   **[CORE] Bulk Address Import Service (API Endpoint):**
    *   Create a new Fastify route (e.g., `/import/addresses`) in `backend/src/modules/import/import.routes.ts`.
    *   Create `import.service.ts` to handle CSV/Excel parsing (use a library like `papaparse` for CSV).
    *   The service should:
        *   Accept a file upload and a `companyId` (or create/find company by name).
        *   Parse addresses and any other relevant data (e.g., per-address threshold if `scope.md` implies that over company-level).
        *   Create records in `Addresses` (if new) and `CompanyAddresses` (linking address to company, marking as active). Handle "replace" vs "append" logic if needed.
        *   Log the import in `ImportBatches`.
        *   After successful import, trigger `WsConnectionManager.reloadAddressesFromDB()` to update tracked addresses. (Target: `scope.md` - Week 1 - Bulk address import UI/CLI with company tagging)
*   **[ADMIN] Basic Next.js Admin Panel Setup:** Initialize a Next.js project in `frontend/`. Create a very simple page (e.g., for triggering the import or viewing status). (Target: `scope.md` - Week 2 - Build Next.js admin panel)
*   **[ADMIN] Basic Admin Panel - Live Status/Balances (Placeholder):** Create a placeholder page in the admin panel. For MVP, this might just show the count of tracked addresses or latest events from the `TrackedTransfer` table. Full live balances can be deferred if time is tight. (Target: `scope.md` - Week 2 - Admin panel: live status, balances & recent events)

--- 

### **Day 5: Export, Polish & Buffer**

*   **[CORE] "Export to Excel/CSV" Service (API Endpoint):**
    *   Create a Fastify route (e.g., `/export/company/:companyId/addresses`) in a relevant module.
    *   The service should query `CompanyAddresses` (and related tables like `Addresses`, potentially `TrackedTransfer` for recent activity) for a given company.
    *   Format data into CSV (e.g., using `papaparse` to convert JSON to CSV string).
    *   Return the CSV data with appropriate `Content-Type` and `Content-Disposition` headers for download. (Target: `scope.md` - Week 2 - Add "Export to Excel/CSV" per company)
*   **[TEST] End-to-End Test:** Perform a full manual test: import addresses for a company, send test transactions on EVM and Tron, verify Slack alerts, verify data in DB, export data. 
*   **[CORE] Configuration Review:** Review all `.env` variables and `appConfig` settings for correctness.
*   **Buffer Time:** Address any critical bugs, polish basic UI elements, and refine any rough edges. If time allows, consider:
    *   Expanding EVM coverage to a second chain.
    *   Basic error handling improvements in connection managers.

--- 

This is a very aggressive timeline. Success will depend on focused execution and potentially simplifying some aspects of the "nice-to-haves" from the scope for this initial 5-day push. Good luck! 