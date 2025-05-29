# Wallet Watcher Backend Specifications

## Core Functionality
Monitor blockchain addresses for transfers and emit notifications.

## Key Components

### 1. AddressManager
- Tracks wallet addresses in memory
- Updates from database periodically
- Supports both EVM and Tron addresses

### 2. EvmConnectionManager
- Handles WebSocket connections for EVM chains
- Subscribes to new blocks and contract events
- Processes native and token transfers

### 3. TronConnectionManager
- Manages TronGrid WebSocket connection
- Subscribes to TRX and TRC20 transfers
- Converts between hex and base58 addresses

### 4. WsConnectionManager
- Orchestrates WebSocket connections
- Manages address tracking
- Handles reconnection logic

## Data Flow
1. AddressManager loads addresses from database
2. WsConnectionManager initializes chain-specific managers
3. Managers subscribe to relevant events
4. Events are processed and notifications are sent

## Implementation Status

### Completed
- [x] WebSocket infrastructure
- [x] Address management
- [x] Event subscription
- [x] Database schema
- [x] Basic Tron integration

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

## Next Steps
1. Complete Slack integration
2. Develop admin panel
3. Add health checks
4. Implement error handling 