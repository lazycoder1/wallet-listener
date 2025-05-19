## Database Design: Wallet Tracker

This document outlines the database schema for the Wallet Tracker application. The primary goals are to efficiently store imported wallet addresses, track their associated companies, manage import batches, and store company-specific Slack integration details.

### Entities and Relationships

1.  **`companies`**: Stores information about each company using the tracker.
2.  **`addresses`**: Stores individual wallet addresses and their associated chain.
3.  **`company_addresses`**: A join table to link addresses to companies, allowing an address to potentially be associated with multiple companies over time (though the current "drop & replace" logic might simplify this). It also stores company-specific metadata for an address, like the alert threshold.
4.  **`import_batches`**: Logs each file import event.
5.  **`batch_addresses`**: Links addresses to a specific import batch, indicating which addresses were part of which upload.
6.  **`alerts`**: Logs each Slack notification sent.
7.  **`slack_configurations`**: Stores Slack-specific settings for each company.

### Schema Definition

Here's a proposed schema using SQL-like syntax. Primary keys are auto-incrementing integers unless specified.

---

#### Table: `companies`

Stores company-specific information.

| Column Name      | Data Type     | Constraints                   | Description                                  |
| ---------------- | ------------- | ----------------------------- | -------------------------------------------- |
| `id`             | `SERIAL`      | `PRIMARY KEY`                 | Unique identifier for the company.           |
| `name`           | `VARCHAR(255)` | `NOT NULL`, `UNIQUE`          | Name of the company.                         |
| `created_at`     | `TIMESTAMP`   | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | Timestamp of company creation.               |
| `updated_at`     | `TIMESTAMP`   | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | Timestamp of last update.                    |

---

#### Table: `addresses`

Stores unique wallet addresses. We store addresses here to avoid duplication if the same address is used by multiple companies or in multiple imports.

| Column Name  | Data Type     | Constraints          | Description                                     |
| ------------ | ------------- | -------------------- | ----------------------------------------------- |
| `id`         | `SERIAL`      | `PRIMARY KEY`        | Unique identifier for the address.              |
| `address`    | `VARCHAR(255)` | `NOT NULL`, `UNIQUE` | The wallet address string (e.g., 0x... or TR...). |
| `chain_type` | `VARCHAR(50)` | `NOT NULL`           | Type of blockchain (e.g., 'EVM', 'TRON').       |
| `created_at` | `TIMESTAMP`   | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | Timestamp of address creation.                  |

*Indexes:*
*   `idx_address_address_chain`: On (`address`, `chain_type`) for quick lookups.

---

#### Table: `company_addresses` (Join Table)

Links companies to addresses and stores company-specific address metadata. This table represents the "active" list of addresses for a company.

| Column Name        | Data Type     | Constraints                                  | Description                                                                 |
| ------------------ | ------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| `id`               | `SERIAL`      | `PRIMARY KEY`                                | Unique identifier for the company-address link.                             |
| `company_id`       | `INTEGER`     | `NOT NULL`, `REFERENCES companies(id)`       | Foreign key to the `companies` table.                                       |
| `address_id`       | `INTEGER`     | `NOT NULL`, `REFERENCES addresses(id)`       | Foreign key to the `addresses` table.                                       |
| `is_active`        | `BOOLEAN`     | `NOT NULL DEFAULT TRUE`                      | Whether this address is currently active for monitoring for this company.   |
| `last_balance`     | `DECIMAL`     |                                              | Last known balance (can be NULL if not yet fetched).                        |
| `last_checked_at`  | `TIMESTAMP`   |                                              | Timestamp when the balance was last checked.                                |
| `created_at`       | `TIMESTAMP`   | `NOT NULL DEFAULT CURRENT_TIMESTAMP`         | Timestamp when this address was associated with the company.                |
| `updated_at`       | `TIMESTAMP`   | `NOT NULL DEFAULT CURRENT_TIMESTAMP`         | Timestamp of last update to this record.                                    |

*Constraints:*
*   `uq_company_address`: UNIQUE constraint on (`company_id`, `address_id`) to ensure an address is linked only once per company actively.

*Indexes:*
*   On `company_id`.
*   On `address_id`.

*Note on `is_active`*:
*   When using "Replace" mode for imports, existing active addresses for that company would be marked `is_active = FALSE` before new ones are added/updated.
*   When using "Append" mode, new addresses are added with `is_active = TRUE`. If an appended address already exists for the company, its `updated_at` and potentially other fields would be updated, and it remains `is_active = TRUE`.

---

#### Table: `import_batches`

Records details of each file upload/import operation.

| Column Name      | Data Type     | Constraints                                  | Description                                                        |
| ---------------- | ------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `id`             | `SERIAL`      | `PRIMARY KEY`                                | Unique identifier for the import batch.                            |
| `company_id`     | `INTEGER`     | `NOT NULL`, `REFERENCES companies(id)`       | The company for which the file was imported.                       |
| `import_mode`    | `VARCHAR(50)` | `NOT NULL`                                   | Mode of import ('REPLACE' or 'APPEND').                            |
| `original_filename` | `VARCHAR(255)`|                                              | Name of the uploaded file (optional, for reference).               |
| `total_rows`     | `INTEGER`     | `NOT NULL`                                   | Total rows in the uploaded file.                                   |
| `valid_rows_count` | `INTEGER`     | `NOT NULL`                                   | Number of valid addresses processed from the file.                 |
| `invalid_rows_count` | `INTEGER`   | `NOT NULL`                                   | Number of invalid/skipped addresses from the file.                 |
| `imported_at`    | `TIMESTAMP`   | `NOT NULL DEFAULT CURRENT_TIMESTAMP`         | Timestamp of when the import was processed.                        |
| `raw_file_path`  | `VARCHAR(512)`|                                              | Path or S3 key to the originally uploaded file (for audit download).|

*Indexes:*
*   On `company_id`.

---

#### Table: `batch_addresses` (Join Table)

Tracks which addresses were included in which import batch. This provides a historical record of uploads.

| Column Name     | Data Type | Constraints                                       | Description                                          |
| --------------- | --------- | ------------------------------------------------- | ---------------------------------------------------- |
| `id`            | `SERIAL`  | `PRIMARY KEY`                                     | Unique identifier.                                   |
| `batch_id`      | `INTEGER` | `NOT NULL`, `REFERENCES import_batches(id)`       | Foreign key to the `import_batches` table.           |
| `address_id`    | `INTEGER` | `NOT NULL`, `REFERENCES addresses(id)`            | Foreign key to the `addresses` table.                |
| `row_data`      | `JSONB`   |                                                   | Original row data from the CSV for this address (optional). |
| `is_valid`      | `BOOLEAN` | `NOT NULL`                                        | Whether this address was considered valid in this batch. |
| `processed_at`  | `TIMESTAMP`| `NOT NULL DEFAULT CURRENT_TIMESTAMP`            | Timestamp.                                           |


*Constraints:*
*   `uq_batch_address`: UNIQUE constraint on (`batch_id`, `address_id`)

*Indexes:*
*   On `batch_id`.
*   On `address_id`.

---

#### Table: `slack_configurations`

Stores Slack integration details on a per-company basis.

| Column Name      | Data Type     | Constraints                                  | Description                                               |
| ---------------- | ------------- | -------------------------------------------- | --------------------------------------------------------- |
| `id`             | `SERIAL`      | `PRIMARY KEY`                                | Unique identifier for the Slack configuration.            |
| `company_id`     | `INTEGER`     | `NOT NULL`, `UNIQUE`, `REFERENCES companies(id)` | Foreign key to the `companies` table (one-to-one).       |
| `webhook_url`    | `VARCHAR(512)` | `NOT NULL`                                   | The Slack Incoming Webhook URL for the company.           |
| `channel_name`   | `VARCHAR(255)` |                                              | Specific Slack channel name (e.g., #alerts-company-x).    |
| `organization_details` | `TEXT`  |                                              | Any relevant Slack organization details (optional).       |
| `alert_threshold`| `DECIMAL`     | `NOT NULL DEFAULT 0`                         | Min. transfer value to trigger an alert for this company. |
| `is_enabled`     | `BOOLEAN`     | `NOT NULL DEFAULT TRUE`                      | Whether Slack alerts are active for this company.         |
| `created_at`     | `TIMESTAMP`   | `NOT NULL DEFAULT CURRENT_TIMESTAMP`         | Timestamp of configuration creation.                      |
| `updated_at`     | `TIMESTAMP`   | `NOT NULL DEFAULT CURRENT_TIMESTAMP`         | Timestamp of last update.                                 |

*Indexes:*
*   On `company_id`.

---

#### Table: `alerts`

Logs all alerts sent to Slack.

| Column Name     | Data Type     | Constraints                                     | Description                                           |
| --------------- | ------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `id`            | `SERIAL`      | `PRIMARY KEY`                                   | Unique identifier for the alert.                      |
| `company_id`    | `INTEGER`     | `NOT NULL`, `REFERENCES companies(id)`          | The company for which the alert was triggered.        |
| `address_id`    | `INTEGER`     | `NOT NULL`, `REFERENCES addresses(id)`          | The address that received the transfer.               |
| `transaction_hash` | `VARCHAR(255)`| `NOT NULL`                                    | The transaction hash of the deposit.                  |
| `amount`        | `DECIMAL`     | `NOT NULL`                                      | The amount of the transfer.                           |
| `token_symbol`  | `VARCHAR(50)` |                                                 | Symbol of the token transferred (e.g., ETH, USDT).    |
| `alert_sent_at` | `TIMESTAMP`   | `NOT NULL DEFAULT CURRENT_TIMESTAMP`            | Timestamp when the Slack alert was sent.              |
| `slack_message_id` | `VARCHAR(255)`|                                                 | Optional: Message ID from Slack if available.         |

*Indexes:*
*   On `company_id`.
*   On `address_id`.
*   On `transaction_hash`.

---

### Considerations & Next Steps:

*   **Data Types:** Adjust `VARCHAR` lengths and `DECIMAL` precision as needed based on expected data.
*   **Indexing:** Add more indexes based on common query patterns as the application evolves. For example, if you frequently query `company_addresses` by `is_active` and `company_id`.
*   **Normalization:** This schema is reasonably normalized. Denormalization might be considered later for specific performance optimizations if required.
*   **Auditing:** The `created_at` and `updated_at` timestamps are good for basic auditing. More comprehensive auditing could involve dedicated audit log tables or triggers.
*   **Soft Deletes:** The `is_active` flag in `company_addresses` is a form of soft delete. You could extend this pattern to other tables if needed.
*   **Foreign Key Actions:** Define `ON DELETE` and `ON UPDATE` actions for foreign keys (e.g., `CASCADE`, `SET NULL`, `RESTRICT`) based on your desired data integrity rules. For example, if a company is deleted, should its associated addresses or import batches also be deleted?
*   **Thresholds:** The `alert_threshold` is currently in `slack_configurations`. The original CSV had a `threshold` column. We need to decide if the threshold is per-address (from CSV) or per-company (from `slack_configurations`). The PRD implies per-company (`Configure per-company webhook & threshold`). The current design aligns with a per-company threshold stored in `slack_configurations`. If per-address thresholds are needed, the `company_addresses` table would be the place to store it, possibly overriding a company-level default.

This database design should provide a solid foundation for the Wallet Tracker application. We can refine it as we proceed with development and encounter more specific requirements. 