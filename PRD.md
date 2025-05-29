# Wallet Tracker Software — MVP PRD

## 1. Overview

**Purpose:**
An internal admin dashboard to monitor blockchain addresses for native and token transfers, with configurable Slack alerts for deposits above specified thresholds.

**Key Goals:**
- Monitor addresses across EVM chains and Tron
- Track both native and token transfers
- Send Slack notifications for deposits above threshold
- Provide simple data export and system health checks

---

## 2. Core Features

### 2.1 Address Management
- Bulk import via CSV/Excel
- Company-based organization
- Support for both EVM (0x) and Tron (TR) addresses
- Validation of address format and chain type

### 2.2 Transfer Monitoring
- Real-time tracking of native transfers
- Real-time tracking of token transfers (ERC20/TRC20)
- Event persistence in database
- Unified event format across chains

### 2.3 Alert System
- Per-company Slack webhook configuration
- Configurable threshold per company
- Alert logging and history
- Support for both native and token transfers

### 2.4 Data Export
- Company-scoped CSV exports
- Current address list with balances
- Import history and audit trail

---

## 3. Technical Requirements

### 3.1 Address Validation
- EVM: `^0x[a-fA-F0-9]{40}$`
- Tron: `^TR[a-zA-Z0-9]{40}$`
- Skip invalid addresses during import
- Report validation errors

### 3.2 WebSocket Integration
- Alchemy for EVM chains
- TronGrid for Tron
- Auto-reconnect on connection drops
- Error handling and logging

### 3.3 Database Schema
- Companies and addresses
- Import batches and history
- Transfer events and alerts
- Slack configurations

### 3.4 API Endpoints
- Address import/export
- Health check
- Alert configuration
- System status

---

## 4. User Stories

### 4.1 Address Management
**As an** admin
**I want to** upload a CSV of addresses
**So that** I can monitor them for transfers

**Acceptance Criteria:**
- [ ] Support CSV/Excel upload
- [ ] Validate address format
- [ ] Associate with company
- [ ] Show import results

### 4.2 Transfer Monitoring
**As an** admin
**I want to** see real-time transfers
**So that** I can track incoming deposits

**Acceptance Criteria:**
- [ ] Show native transfers
- [ ] Show token transfers
- [ ] Display transfer history
- [ ] Filter by company/address

### 4.3 Alert Configuration
**As an** admin
**I want to** set up Slack alerts
**So that** I get notified of deposits

**Acceptance Criteria:**
- [ ] Configure webhook URL
- [ ] Set threshold amount
- [ ] Test alert delivery
- [ ] View alert history

### 4.4 Data Export
**As an** admin
**I want to** export address data
**So that** I can analyze it offline

**Acceptance Criteria:**
- [ ] Export by company
- [ ] Include current balances
- [ ] Include transfer history
- [ ] CSV format support

---

## 5. Implementation Status

### Completed
- [x] WebSocket infrastructure
- [x] Address management
- [x] Event subscription
- [x] Database schema

### In Progress
- [ ] Slack integration
- [ ] Admin panel
- [ ] Import/Export
- [ ] Health checks

### Pending
- [ ] Error handling
- [ ] Testing
- [ ] Documentation
- [ ] Deployment

---

## 6. Next Steps

1. **Immediate**
   - Complete Slack integration
   - Implement import/export
   - Develop admin panel

2. **Technical**
   - Add error handling
   - Implement health checks
   - Add monitoring

3. **Future**
   - Async processing
   - More chains
   - Enhanced features
