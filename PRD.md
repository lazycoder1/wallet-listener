# Wallet Tracker Software — MVP PRD

## 1. Overview

**Purpose:**
An internal admin dashboard to onboard wallet addresses in bulk, monitor chain-wide balances, and fire Slack alerts on deposits above configurable thresholds—quickly and reliably for our first 2–2.5-week MVP.

**Key Goals:**

-   Allow internal ops to upload/update address lists per company
-   Validate & store only well-formed 0x/TR addresses
-   Monitor balances (via third-party APIs) on Eth, BSC, Polygon, or Tron
-   Trigger a Slack notification on every deposit ≥ threshold
-   Provide simple download/export and system-health check

---

## 2. Actors & Roles

| Actor              | Capabilities                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Internal Admin** | • Upload/replace/append CSVs• View company imports• Download raw CSVs• Ping health check• Configure per-company webhook & threshold |

_No external “viewer” roles or per-address Slack controls in MVP._

---

## 3. Assumptions & Constraints

1. **Import behavior**

    - Default **“drop & replace”** mode; optional **“append”** flag
    - On duplicate (same address+chain), newest upload overwrites

2. **Address validation**

    - EVM: must start `0x`, 42 chars; Tron: start `TR`, 42 chars
    - Invalid rows are ignored; show count of rejected addresses post-import

3. **Chains supported**

    - Eth, BSC, Polygon for `0x…` addresses
    - Tron only for `TR…` addresses
    - Company cannot toggle chains—determined per-address type

4. **Balance calculation**

    - Use external APIs; show cumulative token balance per address

5. **Alerts**

    - One Slack webhook per company
    - Fire on every inbound transfer ≥ threshold
    - Persist an **alert log** entry for each notification

6. **Data retention**

    - No raw transfer or snapshot history beyond alert logs

7. **Exports**

    - Ad-hoc CSV recreation of current address + last-known balance

---

## 4. User Stories & Acceptance Criteria

### 4.1 Bulk Import Addresses

**As an** internal admin
**I want to** upload a CSV/XLSX of addresses + company name
**So that** the system can begin monitoring those wallets

**Acceptance Criteria:**

-   [ ] Admin can choose **Drop & Replace** (default) or **Append** mode.
-   [ ] Invalid addresses (incorrect prefix/length) are skipped and counted.
-   [ ] Upon completion, the UI shows a loading spinner and then a **Completed** banner.
-   [ ] The import history lists the new batch with total rows and rejected count.

### 4.2 View & Download Imports

**As an** internal admin
**I want to** see all past imports for a company and download the original files
**So that** I can audit or reprocess data offline

**Acceptance Criteria:**

-   [ ] Import history table displays: date, mode (replace/append), total rows, rejected count.
-   [ ] Each row has a **Download** action that retrieves the exact uploaded CSV/XLSX.

### 4.3 Balance Monitoring & Health Check

**As an** internal admin
**I want to** manually trigger a **Health Check** to verify connectivity to chain APIs
**So that** I can confirm the system is operational

**Acceptance Criteria:**

-   [ ] Clicking **Health Check** calls a backend endpoint that returns **OK** or **Fail**.
-   [ ] UI displays a green **OK** or red **Fail** indicator based on the response.

### 4.4 Slack Alerts

**As an** internal admin
**I want to** configure a Slack webhook URL and a numeric threshold per company
**So that** each deposit ≥ threshold triggers an alert

**Acceptance Criteria:**

-   [ ] Admin can enter and save a valid **webhook URL** and numeric **threshold (≥ 0)**.
-   [ ] For every new deposit ≥ threshold, a message is sent to the configured Slack channel.
-   [ ] Each sent alert is logged in the database with timestamp, address, amount, and tx_hash.

### 4.5 Export Current Data

**As an** internal admin
**I want to** export a CSV of my company’s current addresses and balances
**So that** I can share or archive the latest snapshot

**Acceptance Criteria:**

-   [ ] An **Export to CSV** button is visible on the company page.
-   [ ] Downloaded CSV contains columns: `address`, `chain`, `last_balance`, and `last_checked_at`.

## 5. Data Validation Rules Data Validation Rules Data Validation Rules

| Field         | Validation                                                  |
| ------------- | ----------------------------------------------------------- |
| `address`     | EVM: regex `^0x[a-fA-F0-9]{40}$`Tron: `^TR[a-zA-Z0-9]{40}$` |
| `threshold`   | Decimal **≥ 0**                                             |
| `webhook_url` | Valid HTTPS URL                                             |
| `mode`        | Enum(`replace`, `append`)                                   |

---

## 6. Next Steps

1. **Review & refine** the above stories, criteria, and rules.
2. **Add any missing flows** (e.g. error states or edge-case behaviors).
3. **Sign off** so we can sketch the final DB schema and start development.
