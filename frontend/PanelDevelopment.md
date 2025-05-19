# Admin Panel Development Roadmap

We’ll build the admin panel in three progressive stages to keep the MVP lean, facilitate early testing, and iteratively add backend integration and export capabilities.

---

## Stage 1: Frontend‑Only Upload & Validation

**Objective:** Enable admins to load CSV/XLSX, validate addresses in-browser, and preview results—all without touching the database.

**Features & Tasks:**

1. **File Input & UI**

    - File selector for CSV/XLSX (up to 50k rows)
    - Company-name dropdown or text input
    - Mode toggle: `Replace` (default) vs. `Append`

2. **Client‑Side Parsing**

    - Use \[PapaParse] (or similar) to stream‑parse large files
    - Show progress bar during parsing

3. **Validation Logic**

    - Row‑by‑row check:

        - EVM: `^0x[a-fA-F0-9]{40}$`
        - Tron: `^TR[a-zA-Z0-9]{40}$`

    - Track counts: total rows, valid rows, invalid rows
    - Rows with invalid addresses get flagged/omitted

4. **Preview & Feedback**

    - Display summary: ✓ Y valid, ✗ Z invalid
    - Show first 10 valid + first 10 invalid rows in a table
    - “Complete” banner when parsing/validation finishes

5. **UX Polishing**

    - Disable Upload button while parsing
    - Clear error messaging for file‑type or size issues

**Acceptance Criteria:**

-   [ ] Can select a company and upload a CSV/XLSX file
-   [ ] Progress bar advances during parsing
-   [ ] Validation rules applied client‑side; counts reported
-   [ ] Preview tables show samples of valid + invalid rows
-   [ ] UI shows loading, then a “Completed” message

---

## Stage 2: Backend Integration & Persistence

**Objective:** Wire validated data into the API and store imports and address lists in the database.

**Features & Tasks:**

1. **API Endpoints**

    - `POST /imports` – accept parsed payload: `{ company, mode, addresses: [ { address, chain } ] }`
    - Response returns import ID and row counts

2. **Frontend → API Connection**

    - After client‑side validation, send JSON to `/imports`
    - Show server‑processing spinner until response

3. **Error Handling**

    - Handle API errors (e.g. DB down, validation mismatches)
    - Show toast for success/failure

4. **Import History UI**

    - Fetch `GET /imports?company=XYZ` on page load
    - Display list: import date, mode, total rows, invalid count, download link (placeholder)

5. **Database Schema hooks**

    - Import table, batch_address table populated via API

**Acceptance Criteria:**

-   [ ] Upload flow posts valid payload to backend and returns success
-   [ ] Import history updates with new batch entry
-   [ ] Error states surfaced in UI
-   [ ] Server‑side rejects invalid entries; counts match client summary

---

## Stage 3: Export / Download Functionality

**Objective:** Allow admins to export stored address lists (with current or last-known balances) as CSV files for any import batch or full company list.

**Features & Tasks:**

1. **API Export Endpoints**

    - `GET /exports/company/:id` – returns CSV of all active addresses
    - `GET /exports/import/:importId` – returns CSV of that batch

2. **Frontend Export Buttons**

    - “Download All” on company view
    - “Download Batch” next to each import in history

3. **CSV Generation**

    - Backend streams CSV: columns `address, chain, last_balance?, last_checked_at?`

4. **UI Feedback**

    - Show download spinner; handle network errors

**Acceptance Criteria:**

-   [ ] “Download” buttons trigger file download of correct CSV
-   [ ] CSV contents match database rows for that scope
-   [ ] Frontend displays errors if export fails

---

**Next Steps:**

1. Review stage definitions & acceptance criteria.
2. Adjust timelines per stage—aim to finish Stage 1 in week 1, Stage 2 in first half of week 2, Stage 3 by end of week 2.
3. Begin implementation of Stage 1 components.
