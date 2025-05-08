```markdown
# Wallet Tracker Software: Scope & MVP Roadmap

> **Timeline:** 2–2.5 weeks of active development by a single engineer, plus optional weeks 3–4 for testing, integrations, and refinements

## 1. Project Scope

**Core Functionality**

- **Address Ingestion**
  - Bulk import of 1–2 k wallet addresses via CSV/Excel upload
  - Tag each address by “company” (spreadsheet namespace)
- **Network Support**
  - 3 EVM-compatible chains (Ethereum, BSC, Polygon)
  - 1 Tron network
- **Real-Time Balance & Token Tracking & Connection Management**
  - Subscribe to on-chain events via WebSocket providers (Alchemy for EVM, TronGrid for Tron)
  - Persist balance snapshots and incoming transfer events in PostgreSQL
  - Implement reconnection with exponential back-off and heartbeat pings
- **Alerts**
  - Post to Slack channel(s) for incoming native or token transfers, showing each address’s balance across all supported chains
- **Data Organization**
  - Separate workbooks/tabs per company
  - “Export to Excel/CSV” on demand

**Non-Functional Requirements**

- Scale to 2 k addresses across 4 networks using WebSocket subscriptions
- Resilient to connection drops with auto-reconnect/back-off
- Configurable alert thresholds (e.g. only > 0.01 ETH)
- Lightweight admin panel for configuration & monitoring

**Tech Stack**

- **Backend:** Node.js (Express or NestJS) + ethers.js/web3.js + TronWeb
- **Database:** PostgreSQL
- **WebSocket Providers:** Alchemy WS (EVM) & TronGrid WS (Tron)
- **Admin Panel:** Next.js + Tailwind CSS
- **Messaging:** Slack Webhooks or Bolt SDK

---

## 2. 2–2.5-Week MVP Roadmap

**User Stories Breakdown:**

- **Address Import**
  - **US1:** As an admin, I can upload a CSV/Excel of wallet addresses tagged by company.
  - **US2:** As a system, validate and persist each address in PostgreSQL.

- **WebSocket Listener & Connection Management**
  - **US3:** Subscribe to Alchemy WS for EVM chains.
  - **US4:** Subscribe to TronGrid WS for Tron.
  - **US5:** Record incoming transfer events and balance snapshots in DB.
  - **US6:** Implement reconnection with exponential back-off and heartbeat pings.

- **Slack Bot Setup & Alerts**
  - **US7:** As a developer, set up the Slack bot/app, configure webhooks, and grant necessary permissions.
  - **US8:** Detect first incoming transfer per address.
  - **US9:** Format and send alerts to Slack, including that address’s balances across all supported chains.

- **Export Functionality**
  - **US10:** Export current data to Excel/CSV on demand.

**Phase Schedule:**

| Phase      | Duration | User Stories                |
|:----------:|:--------:|:----------------------------|
| **Week 1** | 5 days   | US1, US2, US3, US4, US6      |
| **Week 2** | 5 days   | US5, US7, US8, US9, US10     |
| **Buffer** | 0.5 week | Polishing & minor tweaks     |

**Milestones:**

- **Day 5:** WS subscription & DB write verified (US3 + US4).
- **Day 8:** Bulk import & connection resilience complete (US1 + US2 + US6).
- **Day 11:** Event capture, Slack bot setup, and detection working (US5 + US7 + US8).
- **Day 13:** Enhanced alerts with cross-chain balances & export ready (US9 + US10).
- **Day 14–17:** Buffer for refinements and bug fixes (2.5-week target).

---

## 3. Week 3 (Optional): Testing & QA

| Sprint     | Focus            | Deliverables                                                                                         |
|:----------:|:-----------------|:-----------------------------------------------------------------------------------------------------|
| **Week 3** | Testing & QA     | - Unit & integration tests with mocked WS feeds  
                                     - Load-test ingestion & subscriptions for 2 k addresses                                              |

---

## 4. Week 4 (Optional): Multi-Company & Slack Refinement

| Sprint     | Focus                          | Deliverables                                                                     |
|:----------:|:-------------------------------|:---------------------------------------------------------------------------------|
| **Week 4** | Integrations & Refinements      | - Support multi-company Slack mapping  
                                        - Dedicated Slack channels per company  
                                        - UI for alert thresholds & token-type filters  |

---

## 5. Future Scope: Hardening, Deployment & Observability

- **Hardening & Deployment**
  - Docker Compose & deployment scripts
  - Health-check endpoints & monitoring setup
- **Observability**
  - Structured logging (Winston) & error tracking (Sentry)
  - Metrics exposure for Prometheus/Grafana

---

## 6. Next Steps

1. **Finalize Requirements:** Confirm chains, event types, alert rules, user roles.
2. **Provisioning:** Obtain Alchemy & TronGrid WS keys, create Slack app/webhooks, provision PostgreSQL.
3. **Kick-off Phase:** Assign tickets, set up CI/CD pipelines, schedule daily check-ins.

---

*This plan lays out a 2–2.5-week MVP for a single engineer, with optional weeks 3–4 for testing, integrations, and production hardening.*
```
