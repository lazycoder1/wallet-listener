# Balance Service Redesign - Implementation Plan

## Current Issues
- Balance fetches are failing across multiple chains
- **Primary Focus**: "Wallet total EVM balance is $0.00" - inaccurate total balance calculation
- Manual RPC calls are unreliable and slow
- No unified multi-chain balance aggregation

## Proposed Solution: Alchemy Portfolio API Integration

### Overview
Replace the current balance service with Alchemy's Portfolio API to fetch token balances across ETH mainnet, Polygon mainnet, and BNB mainnet in a single efficient call, then sum up the total USD value for accurate balance reporting.

### API Endpoint
```
POST https://api.g.alchemy.com/data/v1/{ALCHEMY_ID}/assets/tokens/by-address
```

### Benefits
1. **Single API Call**: Get balances for multiple networks simultaneously
2. **Price Data Included**: USD values included in response
3. **Native + ERC-20**: Handles both native tokens and ERC-20 tokens
4. **Reliable Infrastructure**: Alchemy's robust API infrastructure
5. **Accurate Total Balance**: Proper multi-chain USD value aggregation

## Implementation Plan

### 1. Environment Configuration
Using existing `ALCHEMY_ID` from .env (already configured in config.ts):
```env
ALCHEMY_ID=your_alchemy_api_key_here
```

### 2. New Balance Service Structure
```
backend/src/services/balance/
├── alchemyBalanceService.ts     # Main Alchemy integration
├── multiChainBalanceService.ts  # Multi-chain aggregation logic
├── balanceTypes.ts              # TypeScript interfaces
└── balanceUtils.ts              # Utility functions
```

### 3. Core Implementation

#### 3.1 Alchemy Balance Service (`alchemyBalanceService.ts`)
```typescript
interface AlchemyBalanceRequest {
  addresses: Array<{
    address: string;
    networks: string[];
  }>;
  withMetadata?: boolean;
  withPrices?: boolean;
  includeNativeTokens?: boolean;
}

interface AlchemyTokenBalance {
  network: string;
  address: string;
  tokenAddress: string | null; // null for native tokens
  tokenBalance: string;
  tokenMetadata: {
    name: string;
    symbol: string;
    decimals: number;
  };
  tokenPrices: {
    currency: string;
    value: string;
    lastUpdatedAt: string;
  }[];
}

class AlchemyBalanceService {
  async fetchMultiChainBalances(addresses: string[]): Promise<AlchemyTokenBalance[]>
  async fetchSingleAddressBalances(address: string): Promise<AlchemyTokenBalance[]>
}
```

#### 3.2 Multi-Chain Balance Service (`multiChainBalanceService.ts`)
```typescript
interface WalletBalance {
  address: string;
  totalUsdValue: number;
  chainBalances: {
    [chainId: string]: {
      chainName: string;
      chainTotalUsd: number;
    };
  };
}

class MultiChainBalanceService {
  async getWalletTotalBalance(address: string): Promise<WalletBalance>
  async getBatchWalletBalances(addresses: string[]): Promise<WalletBalance[]>
  private aggregateBalancesByChain(alchemyData: AlchemyTokenBalance[]): WalletBalance
}
```

### 4. Network Configuration
```typescript
const SUPPORTED_NETWORKS = {
  ethereum: {
    alchemyNetwork: 'eth-mainnet',
    chainId: 1,
    nativeSymbol: 'ETH'
  },
  polygon: {
    alchemyNetwork: 'polygon-mainnet',
    chainId: 137,
    nativeSymbol: 'MATIC'
  },
  bsc: {
    alchemyNetwork: 'bnb-mainnet',
    chainId: 56,
    nativeSymbol: 'BNB'
  }
};
```

### 5. Integration Points

#### 5.1 Transaction Processing
Update transaction processing to use the new balance service:
```typescript
// After detecting a deposit/withdrawal
const walletBalance = await multiChainBalanceService.getWalletTotalBalance(address);
const summaryMessage = `Wallet ${address} has a deposit of ${amount} ${symbol} worth $${usdValue}. Wallet total EVM balance is $${walletBalance.totalUsdValue.toFixed(2)}.`;
```

#### 5.2 Notification Service
Update Slack notifications to include accurate total balance:
```typescript
const notificationData = {
  ...transactionData,
  walletTotalUsdBalance: walletBalance.totalUsdValue,
  chainBreakdown: walletBalance.chainBalances
};
```

### 6. Error Handling & Fallbacks

#### 6.1 Rate Limiting
- Implement exponential backoff for rate limits
- Cache responses for 30 seconds to reduce API calls
- Batch multiple address requests when possible

#### 6.2 Fallback Strategy
- If Alchemy API fails, return last known balance with warning
- Log failures for monitoring
- Return partial data with warnings

### 7. Caching Strategy
```typescript
interface BalanceCache {
  address: string;
  balanceData: WalletBalance;
  timestamp: number;
  expirySeconds: number;
}

// Cache balances for 30 seconds to reduce API calls during high transaction volume
const BALANCE_CACHE_TTL = 30;
```

### 8. Migration Steps

#### Phase 1: Implementation
1. Create new balance service files
2. Implement Alchemy API integration using existing ALCHEMY_ID
3. Add comprehensive error handling
4. Implement caching layer

#### Phase 2: Testing
1. Unit tests for balance calculations
2. Integration tests with mock Alchemy responses
3. Test with real wallet addresses
4. Verify USD value calculations and aggregation

#### Phase 3: Integration
1. Update transaction processing to use new balance service
2. Update notification service for accurate total balance
3. Add monitoring and logging
4. Deploy and monitor

#### Phase 4: Cleanup
1. Remove old balance aggregation code
2. Update documentation
3. Remove unused dependencies

### 9. Performance Improvements
- **Batching**: Group multiple addresses in single API call (max 2 addresses, 5 networks each)
- **Parallel Processing**: Process multiple batches in parallel
- **Caching**: Cache responses to avoid redundant calls
- **Optimized Networks**: Only query networks where addresses are active

### 10. Monitoring & Logging
```typescript
// Log balance service performance
logger.info('Balance fetch completed', {
  address,
  totalUsdValue,
  responseTime: Date.now() - startTime,
  chainsQueried: Object.keys(balanceData.chainBalances)
});

// Monitor API quota usage
logger.info('Alchemy API usage', {
  endpoint: 'tokens-by-address',
  addressCount: addresses.length,
  networkCount: networks.length
});
```

### 11. Expected Benefits
1. **Accurate Total Balance**: Fix "Wallet total EVM balance is $0.00" issue
2. **Reliability**: Eliminate RPC failures for balance calculations
3. **Performance**: Faster balance fetches with single API call
4. **Real-time USD Values**: Up-to-date pricing data
5. **Scalability**: Handle multiple addresses and networks efficiently

### 12. Out of Scope (For Later)
- Token identification ("UNKNOWN_ERC20" issue) - will be addressed separately
- Token metadata resolution - keeping existing fallback to tokens.json
- Individual token balance display improvements

## Review Checklist
- [x] Use existing ALCHEMY_ID configuration
- [ ] Error handling for API failures
- [ ] Caching implementation
- [ ] Batch processing logic
- [ ] Integration with existing notification flow
- [ ] Focus only on total balance calculation
- [ ] Testing strategy
- [ ] Migration plan
- [ ] Performance monitoring

## Next Steps
1. Review this focused implementation plan
2. Verify ALCHEMY_ID is properly configured (already done in config.ts)
3. Implement Phase 1 (core balance service for total USD calculation)
4. Test with real wallet addresses
5. Integrate with transaction processing for accurate total balance
6. Deploy and monitor 