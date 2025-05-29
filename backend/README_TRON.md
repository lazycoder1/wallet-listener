# Tron Blockchain Integration for Wallet Watcher

This document explains how the Tron blockchain integration works in the Wallet Watcher application.

## Overview

Unlike EVM chains which support WebSockets for real-time event monitoring, Tron requires a polling-based approach using REST APIs. The implementation uses the TronGrid API to efficiently monitor transactions and token transfers.

## Key Components

1. **TronConnectionManager**: Handles polling for new transactions and token transfers
2. **TokenService**: Extended to support Tron tokens (TRC20, TRC10)
3. **BalanceService**: Extended to fetch Tron balances

## Configuration

In your `.env` file, add the following variables:

```
# Tron API configuration
TRONGRID_API_URL=https://api.trongrid.io
TRONGRID_API_KEY=your_api_key_here
```

## Automatic Startup

The Tron monitoring system starts automatically when the server starts, alongside the EVM monitoring system. The server initializes:

1. The TokenService (for token metadata and prices)
2. An EVM connection manager
3. A Tron connection manager

Both monitoring systems run in parallel, allowing you to track addresses on both EVM chains and the Tron blockchain simultaneously.

## Switching Monitoring Modes

You can control which blockchain monitoring systems are active using the API:

```
POST /api/monitoring/mode
{
  "mode": "evm" | "tron" | "both"
}
```

This allows you to:
- Run only EVM monitoring
- Run only Tron monitoring
- Run both systems simultaneously

You can also check the current monitoring status:

```
GET /api/monitoring/status
```

This returns information about which monitoring systems are active and how many addresses they're tracking.

## How It Works

### Transaction Monitoring

The system polls for new transactions using two separate mechanisms:

1. **Native TRX Transfers**: Polls every 3 seconds for new blocks and checks for native TRX transfers to tracked addresses
2. **TRC20 Token Transfers**: Polls every 10 seconds for token transfers to tracked addresses

### Address Tracking

Both EVM-style addresses (0x...) and Tron-style addresses (T...) are supported. The system automatically converts between formats as needed.

### Rate Limiting

The implementation respects the TronGrid API rate limits (100,000 calls/day) by:

1. Processing addresses in batches
2. Using efficient polling intervals
3. Adding small delays between API calls
4. Tracking the last processed timestamp to avoid redundant queries

## Testing

You can test the Tron integration using the provided scripts:

1. First, add some Tron tokens to your database:
   ```
   npx ts-node src/add-trx-token.ts
   ```

2. Then run the test script to monitor transactions:
   ```
   npx ts-node src/test-tron.ts
   ```

## Monitoring Different Address Types

The system can monitor both:

1. **Tron Addresses** (e.g., `TJRabPrwbZy45sbavfcjinPJC18kjpRTv8`)
2. **EVM Addresses** converted to Tron format

## Error Handling

The implementation includes robust error handling:

1. Exponential backoff for API failures
2. Circuit breaker pattern to prevent excessive API calls during outages
3. Detailed logging of errors and API responses

## Balance Calculation

The `BalanceService` has been extended to:

1. Fetch native TRX balances
2. Fetch TRC20 token balances
3. Calculate USD values based on current token prices

## Future Enhancements

1. Support for TRC10 tokens
2. Webhook support for real-time notifications
3. Running a full Tron node for better reliability

## API Documentation

For more details on the TronGrid API, see:
- https://developers.tron.network/
- https://docs.tronscan.org/api-endpoints/ 