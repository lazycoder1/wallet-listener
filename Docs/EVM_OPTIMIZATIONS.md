# EVM Chain Optimizations & Implementation

## Overview

This document outlines the optimizations and implementation details for EVM (Ethereum Virtual Machine) chain monitoring in the Wallet Tracker application. The system efficiently tracks wallet addresses across multiple EVM-compatible blockchains, detecting both native coin transfers and ERC20 token transfers.

## Supported Chains

The application currently supports the following EVM-compatible chains:

| Chain Name | Chain ID | Network Type | RPC Provider |
|------------|----------|--------------|--------------|
| Ethereum   | 1        | Mainnet      | Alchemy      |
| Polygon    | 137      | Mainnet      | Alchemy      |
| BNB Chain  | 56       | Mainnet      | Alchemy      |

## Architecture Components

### 1. Connection Management

The `EvmConnectionManager` class handles WebSocket connections to different EVM chains:

- **Initialization**: Creates WebSocket connections to each supported chain
- **Chain Configuration**: Uses viem's built-in chain objects for type-safe chain information
- **Multicall Support**: Enables batched RPC calls for performance optimization
- **Error Handling**: Graceful reconnect mechanisms for network disruptions

### 2. Event Monitoring Strategy

#### Previous Approach (Before Optimization)
The initial implementation monitored blockchain events using a less optimized approach:

1. Watched for new blocks across all chains
2. Fetched all logs and transactions from each block
3. Manually filtered logs to find transfers to tracked addresses
4. Processed both native transfers and ERC20 token transfers sequentially

#### Optimized Approach
The current implementation uses a more efficient dual monitoring system:

1. **Native Transfers**:
   - Watches for new blocks
   - Filters transactions directly in the block data to find transfers to tracked addresses
   - Processes only relevant transactions

2. **ERC20 Token Transfers**:
   - Uses viem's specialized event filtering to directly target Transfer events
   - Applies filters at the RPC level to get only events where the recipient (`to` parameter) matches tracked addresses
   - Utilizes the Transfer event signature (`0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`) for efficient filtering

## Implementation Details

### Address Management

```typescript
// Using Viem's type-safe address handling
const trackedAddresses = this.addressManager.getTrackedAddresses();
```

- Addresses are stored in a dedicated `AddressManager` class
- All addresses are normalized to lowercase
- Addresses are typed as `Hex` from viem for type safety

### WebSocket Event Subscription

```typescript
// Direct event filtering for ERC20 transfers
const unwatch = client.watchEvent({
    event: ERC20_TRANSFER_EVENT,
    args: {
        to: trackedAddresses as `0x${string}`[],
    },
    poll: true,
});
```

- Uses WebSocket for real-time event monitoring
- Falls back to polling when WebSockets aren't available
- Leverages RPC-level filtering to minimize data transfer and processing

### Efficient Transfer Processing

Native transfers:
```typescript
// Pre-filter transactions to only those involving tracked addresses
const relevantTransactions = transactions.filter(tx => 
    tx.to && trackedAddresses.includes(tx.to.toLowerCase() as Hex)
);
```

ERC20 transfers:
```typescript
// Decode logs with proper type safety
const decodedLog = decodeEventLog({
    abi: [ERC20_TRANSFER_EVENT],
    data: log.data,
    topics: log.topics,
});
```

## Performance Optimizations

1. **RPC-Level Filtering**:
   - Filter events directly at the RPC level instead of client-side
   - Dramatically reduces network bandwidth and processing requirements

2. **Batched RPC Calls**:
   - Enable multicall support for batching multiple RPC calls
   - Reduces the number of separate HTTP requests

3. **Efficient Chain Management**:
   - Separation of native and token transfer monitoring
   - Dedicated methods for each chain to enable parallel processing

4. **Smart Reconnection Logic**:
   - Graceful handling of connection losses
   - Automatic reconnection with exponential backoff

5. **Token and Price Caching**:
   - Integrated with TokenService for efficient token metadata lookup
   - Caching of token details to reduce duplicate lookups

## Blockchain-Specific Considerations

### Ethereum
- Uses Alchemy's WebSocket endpoint for optimal performance
- Enables multicall support for efficient contract reads

### Polygon
- Handles Polygon's higher transaction volume efficiently
- Uses specialized Alchemy endpoints for Polygon

### BNB Chain
- Uses the appropriate `bnb-mainnet` endpoint format for Alchemy
- Chain is referenced as "BNB" throughout the application (formerly BSC)

## Event Handling

When transfers are detected (either native or ERC20), the system:

1. Logs the event details with appropriate context
2. Notifies relevant services about the transfer
3. Stores the event in the database
4. Calculates the USD value based on current token prices
5. Sends alerts through configured channels (e.g., Slack)

## Technical Implementation

### viem Integration

The system leverages viem, a modern TypeScript library for Ethereum:

```typescript
import {
    createPublicClient, http, webSocket,
    decodeEventLog, parseAbiItem
} from 'viem';
import { mainnet, polygon, bsc } from 'viem/chains';
```

Benefits:
- Type-safe interactions with EVM chains
- Efficient encoding/decoding of blockchain data
- Tree-shakable modules for reduced bundle size
- Modern event subscription API

### JSON-RPC Methods Used

The implementation uses these underlying JSON-RPC methods:

- `eth_blockNumber` - Get the latest block number
- `eth_getBlockByNumber` - Get block details with transactions
- `eth_getLogs` - Get event logs from blocks
- `eth_newFilter` - Create a filter for events
- `eth_getFilterChanges` - Get new events from a filter
- `eth_subscribe` - Create a WebSocket subscription

## Future Enhancements

Planned improvements to the EVM monitoring system:

1. **Dynamic Chain Addition**:
   - Ability to add/remove chains without code changes
   - Admin interface for chain configuration

2. **Advanced Filtering**:
   - Support for more complex event criteria
   - Contract-specific filters

3. **Performance Monitoring**:
   - Track RPC usage and performance metrics
   - Optimize for high-volume chains

4. **Failover Mechanisms**:
   - Multiple RPC providers per chain
   - Automatic fallback on provider failures

5. **Scalability Improvements**:
   - Sharded processing for large address sets
   - Distributed event monitoring across multiple nodes 