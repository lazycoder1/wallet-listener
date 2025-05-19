# Wallet Tracker Software: Scope & MVP Roadmap

> **Timeline:** 2–2.5 weeks of active development , plus optional 3rd-week extension for testing & scaling

## 1. Project Scope

**Core Functionality**

-   **Address Ingestion**
    -   Bulk import of 1–2k wallet addresses via CSV/Excel upload (synchronous processing for MVP).
    -   Future Enhancement: Scale to 50k+ addresses with asynchronous processing and background jobs.
    -   Tag each address by "company" (spreadsheet namespace)
-   **Network Support**
    -   3 EVM-compatible chains (Ethereum, BSC, Polygon)
    -   1 Tron network
-   **Real-Time Balance & Token Tracking**
    -   Subscribe to on-chain events via WebSocket providers (Alchemy for EVM, TronGrid for Tron)
    -   Persist balance snapshots and incoming transfer events in PostgreSQL
-   **Alerts**
    -   Post to Slack channel(s) for incoming native or token transfers
-   **Data Organization**
    -   Separate workbooks/tabs per company
    -   "Export to Excel/CSV" on demand

**Non-Functional Requirements**

-   Scale to 2k addresses across 4 networks using WebSocket subscriptions (initial address import synchronous).
-   Future Enhancement: Asynchronous import processing for larger datasets (50k+).
-   Resilient to connection drops with auto-reconnect/back-off
-   Configurable alert thresholds (e.g. only >0.01 ETH)
-   Lightweight admin panel for configuration & monitoring

**Tech Stack**

-   **Backend:** Node.js (Express or NestJS) + ethers.js/web3.js + TronWeb
-   **Database:** PostgreSQL
-   **WebSocket Providers:** Alchemy WS (EVM) & TronGrid WS (Tron)
-   **Admin Panel:** Next.js + Tailwind CSS
-   **Messaging:** Slack Webhooks or Bolt SDK

---

## 2. 2–2.5-Week MVP Roadmap

|   Phase    | Focus                                   | Deliverables                                                                                                                                                                                             |
| :--------: | :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Week 1** | **Core Ingestion & Real-Time Tracking** | - Bulk address import UI/CLI with company tagging<br>- Define PostgreSQL schema<br>- Connect WS subscribers to Alchemy (EVM) & TronGrid (Tron)<br>- Implement listener service to record events & balances |
| **Week 2** | **Alerts & Export + Half-Week Buffer**  | - Integrate Slack Webhook for a dev channel<br>- Trigger formatted alerts on first incoming transfer per address<br>- Build Next.js admin panel: live status, balances & recent events<br>- Add "Export to Excel/CSV" per company<br>- Reserve 0.5 week for scope creep, polishing, minor tweaks |

**Milestones**

-   **Day 5:** WebSocket subscription & event write to PostgreSQL
-   **Day 8:** Bulk import + real-time updates for one EVM chain + Tron in sandbox
-   **Day 11:** Slack alerts for incoming native & token transfers
-   **Day 13:** Company-scoped export and admin panel basics
-   **Day 14–17:** Buffer period for refinements, extra features, bug fixes (2.5-week target)

---

## 3. 3rd-Week Extension (Optional)

|   Sprint   | Focus            | Deliverables |
| :--------: | :--------------- | :----------- |
| **Week 3** | **Testing & QA** |

-   Unit & integration tests with mocked WS feeds
-   Load-test ingestion & subscriptions for 2k addresses |
    | | **Slack Integration Refinement**
-   Per-company Slack channels
-   UI for threshold & token-type filters |
    | | **Hardening & Deployment**
-   Auto-reconnect/back-off logic
-   Health-check endpoints & monitoring
-   Docker Compose & deployment scripts |

---

## 4. Next Steps

1. **Finalize Requirements:** Confirm chains, event types, alert rules, user roles.
2. **Provisioning:** Obtain Alchemy & TronGrid WS keys, create Slack app/webhooks, provision PostgreSQL.
3. **Kick-off Phase:** Assign tickets, set up CI/CD pipelines, schedule daily stand-ups or async updates.

---

_This plan accommodates a 2–2.5-week MVP delivery at 4–6 hours/day, with a 3rd-week option for in-depth testing and production hardening._
```
