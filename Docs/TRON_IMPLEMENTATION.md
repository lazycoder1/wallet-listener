# Tron Implementation for Wallet-Watcher

## Overview

This document outlines the implementation strategy for monitoring Tron blockchain transactions within the wallet-watcher application. Unlike EVM chains which support WebSockets, Tron requires a polling-based approach using REST APIs. We'll leverage the TronGrid API and TronWeb library for efficient transaction monitoring.

## Implementation Strategy

### Architecture

We'll implement a `TronConnectionManager` class similar to the existing `EvmConnectionManager`, which will:

1. Poll for new transactions at regular intervals using TronGrid's event API
2. Process relevant transactions (incoming transfers to tracked addresses)
3. Notify other services about detected transfers
4. Maintain the same interface as the EVM implementation for consistency

### Component Reuse

To maintain architectural consistency and minimize redundant code, we'll reuse these existing components:

1. **AddressManager**: For tracking addresses (same as EVM implementation)
2. **TokenService**: For token metadata and price information
3. **NotificationService**: For alerting users about detected transfers
4. **WsConnectionManager**: As the orchestration layer, despite the naming

### API Selection

After evaluating available options, we'll use a combination of:

1. **TronGrid API with TronWeb**: 
   - Clean interface for contract events through `tronGrid.contract.getEvents()`
   - Efficient filtering by token contract and event name
   - Timestamp-based incremental monitoring

2. **Tronscan API** (as a fallback or supplement):
   - Reliable and well-maintained official API
   - Comprehensive transaction data
   - Support for both TRX and token transfers
   - Token metadata and price information

### Rate Limit Management

The APIs have a limit of 100,000 calls/day, which we'll manage through:

**Polling Strategy**:
- Token event polling: Polling is done *per tracked TRC20 token contract address*. If we track 3 TRC20 tokens, and poll each every 5 minutes: `3 tokens * (24 * 60 / 5) calls/day = 3 * 288 = 864 calls/day`.
- Block polling for native transfers: Every 10 seconds (as per previous estimates, approx. 8,640 calls/day using the block-based method).
- Total estimated API usage: `864 (TRC20) + 8,640 (Native) = ~9,504 calls/day` (well below the 100,000 limit, and independent of the number of tracked wallet addresses for TRC20 API calls).

## Implementation Details

### TronConnectionManager Class

```typescript
// Actual code structure
export class TronConnectionManager {
    private addressManager: AddressManager;
    private eventHandler: EventHandlerCallback | null;
    private notificationService: NotificationService;
    private tokenService: TokenService;
    private tronWeb: any; // TronWeb instance
    private tronGrid: any; // TronGrid instance
    private pollIntervals: Map<string, NodeJS.Timeout> = new Map();
    private tokenLastTimestamps: Map<string, number> = new Map();
    private lastProcessedBlockNum: number = 0;
    private trackedTokens: Array<{address: string, symbol: string, decimals: number}> = [];

    constructor(addressManager: AddressManager, handler: EventHandlerCallback | null) {
        // Initialize services and managers
        this.tronWeb = new TronWeb({
            fullHost: "https://api.trongrid.io"
        });
        this.tronGrid = new TronGrid(this.tronWeb);
    }

    public async start(): Promise<void> {
        // Load tracked tokens
        this.trackedTokens = this.tokenService.getTronTokens();
        
        // Start token event polling
        this.trackedTokens.forEach(token => {
            this.startTokenEventPolling(token.address);
        });
        
        // Start native TRX transfer polling
        this.startNativeTransferPolling();
    }

    public stop(): void {
        // Stop all polling intervals
        this.pollIntervals.forEach((interval, key) => {
            clearInterval(interval);
        });
        this.pollIntervals.clear();
    }

    private async startTokenEventPolling(tokenContractAddress: string, tokenSymbol: string, tokenDecimals: number): Promise<void> {
        const pollFn = async () => {
            try {
                // Use a timestamp specific to this token contract or a global TRC20 timestamp
                const lastTimestamp = this.tokenLastTimestamps.get(tokenContractAddress) || 0;
                
                // API call to TronScan (assuming this is the intended API as per recent discussions)
                // The endpoint should be for TRC20 transfers, filtered by contract_address
                const baseUrl = (appConfig.tronScan.apiUrl || 'https://apilist.tronscanapi.com').replace(/\/$/, '');
                const url = `${baseUrl}/api/token_trc20/transfers`;

                const response = await axios.get(url, {
                    params: {
                        contract_address: tokenContractAddress,
                        start_timestamp: lastTimestamp + 1, // Fetch records after the last processed one
                        limit: 100, // Fetch a reasonable number of records
                        // TronScan API might use 'sort' or rely on default order with start_timestamp
                        // e.g., sort: 'block_timestamp,asc' or similar if available
                        confirm: '0', // Typically fetch confirmed transactions
                    },
                    headers: appConfig.tronScan.apiKey ? { 'TRON-PRO-API-KEY': appConfig.tronScan.apiKey } : undefined
                });
                
                const apiResponse = response.data as unknown as { success?: boolean, data?: any[], error?: string }; // Basic typing

                if (!apiResponse.success || !Array.isArray(apiResponse.data) || apiResponse.data.length === 0) {
                    if (!apiResponse.success) {
                         logger.warn(`[TronScan] Failed to get TRC20 transfers for ${tokenSymbol} (${tokenContractAddress}): ${apiResponse.error || 'API request not successful'}`);
                    }
                    // No new events or unsuccessful call, do nothing further this cycle for this token
                    return; 
                }
                
                const events = apiResponse.data;

                // Update last timestamp for this specific token contract
                const newLastTimestamp = events[events.length - 1].block_timestamp; // Assuming events are ordered by time
                if (newLastTimestamp > lastTimestamp) {
                    this.tokenLastTimestamps.set(tokenContractAddress, newLastTimestamp);
                }
                
                // Client-Side Filtering: Filter events for those involving tracked wallet addresses
                // Efficiently check against a Set of tracked wallet addresses
                const trackedWalletAddressesSet = new Set(this.addressManager.getTrackedAddresses().map(addr => this.tronWeb.address.fromHex(addr))); // Ensure addresses are in correct format for comparison

                const relevantEvents = events.filter(event => {
                    const fromAddressBase58 = this.tronWeb.address.fromHex(event.from_address);
                    const toAddressBase58 = this.tronWeb.address.fromHex(event.to_address);
                    return trackedWalletAddressesSet.has(toAddressBase58) || trackedWalletAddressesSet.has(fromAddressBase58); // Check if to OR from is tracked
                });
                
                if (relevantEvents.length > 0) {
                    logger.info(`[TronScan] Found ${relevantEvents.length} relevant TRC20 transfers for token ${tokenSymbol} (${tokenContractAddress})`);
                    // Process these filtered, relevant events
                    // This would call a method similar to 'this.processTokenEvents(tokenContractAddress, relevantEvents)'
                    // which then calls processTokenTransfer for each.
                    for (const event of relevantEvents) {
                        // Adapt event to the structure expected by processTokenTransfer
                        // Ensure processTokenTransfer is robust enough for this input
                        await this.processTokenTransfer(event); // Assuming processTokenTransfer can handle this event structure
                    }
                }
            } catch (error) {
                logger.error(`Error polling Tron TRC20 token events for ${tokenContractAddress}:`, error);
            }
        };
        
        // Execute immediately once
        await pollFn();
        
        // Then set up interval (every 5 minutes)
        const interval = setInterval(pollFn, 5 * 60 * 1000);
        this.pollIntervals.set(`token-${tokenContractAddress}`, interval);
    }

    private async startNativeTransferPolling(): Promise<void> {
        // Implementation for polling native TRX transfers
    }
}
```

### Alternative Approach: Using TronWeb and TronGrid

The implementation will leverage TronWeb and TronGrid libraries for a more developer-friendly experience:

```javascript
const TronWeb = require("tronweb");
const TronGrid = require("trongrid");

const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io"
});
const tronGrid = new TronGrid(tronWeb);

// For each token contract
async function monitorTokenEvents(contractAddress, lastTimestamp) {
  const result = await tronGrid.contract.getEvents(contractAddress, {
    only_confirmed: true,
    event_name: "Transfer",
    limit: 100,
    min_timestamp: lastTimestamp + 1,
    order_by: "timestamp,asc"
  });
  
  // Process events
  result.data = result.data.map(tx => {
    tx.result.to_address = tronWeb.address.fromHex(tx.result.to);
    return tx;
  });
  
  return result;
}
```

### Balance Checking Implementation

For balance checking, we'll extend the existing `balanceService.ts` to support Tron:

```typescript
// Addition to balanceService.ts
async getTronTokenBalances(address) {
  try {
    const balances = {};
    const tronTokens = this.tokenService.getTronTokens();
    
    // Get native TRX balance
    const trxBalance = await this.tronWeb.trx.getBalance(address);
    balances["TRX"] = this.formatBalance(trxBalance, 6); // TRX has 6 decimals
    
    // Get TRC20 token balances
    for (const token of tronTokens) {
      try {
        // Create contract instance
        const contract = await this.tronWeb.contract().at(token.address);
        
        // Call balanceOf function
        const balance = await contract.balanceOf(address).call();
        
        balances[token.symbol] = this.formatBalance(
          balance.toString(), 
          token.decimals
        );
      } catch (error) {
        logger.error(`Error fetching ${token.symbol} balance for ${address}:`, error);
        balances[token.symbol] = "0";
      }
    }
    
    return balances;
  } catch (error) {
    logger.error(`Error fetching Tron balances for ${address}:`, error);
    return {};
  }
}
```

## Transaction Processing Flow

1. **Token Event Monitoring**:
   - Poll *each tracked TRC20 token contract address* separately using an API like TronScan's `/api/token_trc20/transfers` (or TronGrid's event API if preferred for events specifically).
   - Filter events at the API level by `contract_address` and `start_timestamp`.
   - Track the last processed timestamp *for each token contract individually*.
   - **Client-side Filtering**: After fetching all transfers for a specific token, iterate through them and check if the `from_address` or `to_address` matches any of the system's tracked wallet addresses. This is done efficiently using a Set of tracked wallet addresses.
   - Only process and notify for transfers relevant to the tracked wallet addresses.

2. **Native Transfer Monitoring**:
   - Poll for new blocks at regular intervals
   - Extract and filter native TRX transfers from the block data
   - Store the last processed block number for incremental processing

3. **Unified Processing**:
   - Convert Tron transaction formats to the application's unified format
   - Use the same notification and event handling mechanisms as EVM chains
   - Calculate USD values using the same price service

## Robustness Enhancements

1. **Error Handling and Resilience**:
   - Implement circuit breaker pattern for API failures
   - Use exponential backoff for retry logic
   - Keep separate error handling for each token contract to prevent cascading failures

2. **Modular Architecture**:
   - Separate concerns into specialized handlers:
     - `TronEventPoller`: For managing API polling schedules
     - `TronEventProcessor`: For processing and filtering events
     - `TronConnectionManager`: For orchestrating the components
   - This allows for easier testing and maintenance

3. **Rate Limit Protection**:
   - Implement token bucket algorithm for rate limiting
   - Add adaptive polling based on transaction volume
   - Provide detailed logging of API usage

4. **Monitoring and Observability**:
   - Add detailed metrics for:
     - API call counts and response times
     - Events processed per token contract
     - Error rates and types
   - Implement health checks for each component

## Integration with Existing System

The implementation will maintain the same interfaces as the EVM implementation:

```typescript
// In wsConnectionManager.ts
if (this.chainType === 'evm') {
    this.evmManager = new EvmConnectionManager(this.addressManager, this.eventHandler);
    this.evmManager.start();
} else if (this.chainType === 'tron') {
    this.tronManager = new TronConnectionManager(this.addressManager, this.eventHandler);
    this.tronManager.start();
}
```

This ensures that the existing orchestration layer can work with both EVM and Tron chains without modification.

## Performance Optimizations

1. **Efficient Address Checking**:
   - Use a Set for O(1) address lookups
   - Pre-process addresses to normalize formats

2. **Batch Processing**:
   - Process events in batches to reduce overhead
   - Implement parallel processing for multiple token contracts
   - Use Promise.all for concurrent API calls where appropriate

3. **Caching Strategy**:
   - Cache token metadata and ABI information
   - Implement LRU cache for frequently accessed data
   - Use time-based cache invalidation for balance data

## Future Enhancements

1. **Add Support for TronEventQuery**:
   - Integrate with the `tron-eventquery` service for more efficient block-level event monitoring
   - This could replace individual contract polling for a more scalable solution

2. **Dynamic Token Addition**:
   - Allow runtime addition of new token contracts to monitor
   - Implement automatic discovery of tokens held by tracked addresses

3. **Advanced Filtering**:
   - Add support for more complex event criteria
   - Implement real-time analysis of transaction patterns

## Conclusion

This implementation will provide robust Tron blockchain monitoring capabilities within the existing wallet-watcher architecture. By leveraging TronGrid and TronWeb for event monitoring, we achieve a clean and efficient implementation that maintains consistency with the EVM architecture while adapting to Tron's polling-based approach.

The solution is scalable, maintaining the same interfaces as the EVM implementation while providing the specific functionality needed for Tron. This modular approach ensures that new blockchain types can be added in the future with minimal changes to the core application. 