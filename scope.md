# Wallet Tracker Software: Scope & MVP Roadmap

> **Timeline:** 2–2.5 weeks of active development, plus optional 3rd-week extension for testing & scaling

## 1. Project Scope

**Core Functionality**

-   **Address Ingestion**
    -   Bulk import of 1–2k wallet addresses via CSV/Excel upload (synchronous processing for MVP)
    -   Tag each address by "company" (spreadsheet namespace)
    -   Support for both "drop & replace" and "append" modes
-   **Network Support**
    -   3 EVM-compatible chains (Ethereum, BSC, Polygon)
    -   1 Tron network
-   **Real-Time Balance & Token Tracking**
    -   Subscribe to on-chain events via WebSocket providers (Alchemy for EVM, TronGrid for Tron)
    -   Track both native and token transfers (ERC20/TRC20)
    -   Persist transfer events in PostgreSQL
-   **Alerts**
    -   Post to Slack channel(s) for incoming native or token transfers
    -   Configurable threshold per company
-   **Data Organization**
    -   Separate workbooks/tabs per company
    -   "Export to Excel/CSV" on demand

**Non-Functional Requirements**

-   Scale to 2k addresses across 4 networks using WebSocket subscriptions
-   Resilient to connection drops with auto-reconnect/back-off
-   Lightweight admin panel for configuration & monitoring

**Tech Stack**

-   **Backend:** Node.js + viem + TronWeb
-   **Database:** PostgreSQL + Prisma
-   **WebSocket Providers:** Alchemy WS (EVM) & TronGrid WS (Tron)
-   **Admin Panel:** Next.js + Tailwind CSS
-   **Messaging:** Slack Webhooks

---

## 2. Current Implementation Status

### Completed
- [x] Core WebSocket infrastructure for EVM chains
- [x] Address management system
- [x] Event subscription and filtering
- [x] Database schema design
- [x] Basic Tron integration

### In Progress
- [ ] Slack alert integration
- [ ] Admin panel development
- [ ] Bulk import functionality
- [ ] Export functionality

### Pending
- [ ] Health check endpoints
- [ ] Error handling improvements
- [ ] Testing & documentation
- [ ] Deployment setup

---

## 3. Next Steps

1. **Immediate Priorities**
   - Complete Slack alert integration
   - Implement bulk import functionality
   - Develop basic admin panel

2. **Technical Debt**
   - Add comprehensive error handling
   - Implement health check endpoints
   - Add monitoring and logging

3. **Future Enhancements**
   - Asynchronous import processing
   - Additional chain support
   - Enhanced admin features

---

_This plan is focused on delivering a functional MVP within 2-2.5 weeks, with potential for additional features in a 3rd-week extension._
```
