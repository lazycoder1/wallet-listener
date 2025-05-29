# Tron Transfer Monitoring Process

This document outlines how the backend system monitors and processes native TRX transfers and TRC20 token transfers on the Tron blockchain.

The primary service responsible for this is `TronConnectionManager` located in `backend/src/services/websocket/tronConnectionManager.ts`.

## Core Concepts

- **Polling:** The system uses polling at regular intervals to check for new transactions and transfers.
- **Timestamp Tracking:**
    - `lastProcessedBlockTimestamp`: Stores the timestamp of the last processed native TRX transaction to avoid reprocessing.
    - `lastProcessedTokenTimestamp`: Stores the timestamp of the last processed TRC20 token transfer to avoid reprocessing.
- **Address Batching:** To avoid overwhelming APIs or hitting rate limits, tracked addresses are processed in batches.
- **API Keys:** API calls utilize `appConfig.networks.tron.apiKey` for TronGrid and `appConfig.tronScan.apiKey` for TronScan, sent via the `TRON-PRO-API-KEY` header.

## 1. Native TRX Transfer Monitoring

This process focuses on detecting incoming native TRX (the Tron blockchain's native currency) to tracked addresses by polling for new blocks and inspecting their transactions.

**Initiation:**
- Polling is started by the `startBlockPolling()` method.
- Polling interval is defined by `BLOCK_POLLING_INTERVAL_MS` (e.g., 5000ms, adjusted from the previous 3000ms default for block polling).

**Core Logic:**
1.  The `checkForNewBlocks()` method (renamed from `checkForNewTransactions`) is called at each interval.
2.  It first calls `POST {appConfig.networks.tron.wsUrl}/wallet/getnowblock` to get the number of the latest block (`currentBlockNumber`).
3.  If `currentBlockNumber` is greater than `this.lastProcessedBlockNumber` (a stored variable tracking the last block number whose transactions were fully processed):
    a.  The system iterates from `this.lastProcessedBlockNumber + 1` to `currentBlockNumber`.
    b.  For each block number in this range, it calls `POST {appConfig.networks.tron.wsUrl}/wallet/getblockbynum` (with the block number as a parameter) to fetch the full block data.
    c.  It then iterates through all `transactions` within the fetched block.

**API Calls for Native TRX Transactions (Block-Based):**
1.  **Get Latest Block Number:**
    - **Method:** `POST`
    - **Endpoint:** `{appConfig.networks.tron.wsUrl}/wallet/getnowblock`
    - **Payload:** `{}` (empty or specific fields as required by the API, often none needed for `getnowblock`)
2.  **Get Block by Number (repeated for each new block):**
    - **Method:** `POST`
    - **Endpoint:** `{appConfig.networks.tron.wsUrl}/wallet/getblockbynum`
    - **Payload:** `{"num": blockNumber}` (where `blockNumber` is the specific block to fetch).

    *Note: `appConfig.networks.tron.wsUrl` typically defaults to `https://api.trongrid.io`.*

**Transfer Identification & Processing (within each transaction of a block):**
1.  For each transaction, check `transaction.ret[0].contractRet === 'SUCCESS'`.
2.  Access the contract details: `transaction.raw_data.contract[0]`.
3.  If `contract.type === 'TransferContract'`:
    a.  This indicates a native TRX transfer.
    b.  Extract `owner_address` (sender, hex format), `to_address` (receiver, hex format), and `amount` from `contract.parameter.value`.
    c.  Convert the hex `to_address` to its Base58 representation (`T...` format).
    d.  Check if this Base58 `to_address` is in the system's list of tracked addresses.
4.  If it's a relevant incoming transfer to a tracked address, it's passed to `processNativeTransfer(adaptedTransactionData)`.
    - `adaptedTransactionData` would be an object constructed to match the expected input of `processNativeTransfer`, including `txID`, `blockNumber`, `blockTimeStamp`, sender, receiver, and amount, derived from the block's transaction data.
5.  `processNativeTransfer` then:
    - Extracts details.
    - Calculates USD value using `TokenService`.
    - Sends a notification via `NotificationService.notifyDeposit()`.
    - Emits a `UnifiedTransferEvent` of type `NATIVE` via the `eventHandler`.
6.  After processing all relevant blocks up to `currentBlockNumber`, `this.lastProcessedBlockNumber` is updated to `currentBlockNumber`.

## 2. TRC20 Token Transfer Monitoring

This process focuses on detecting incoming TRC20 token transfers to tracked addresses.

**Initiation:**
- Polling is started by the `startTokenPolling()` method.
- Polling interval is defined by `TOKEN_POLLING_INTERVAL_MS` (e.g., 10000ms).

**Core Logic:**
1.  The `checkForTokenTransfers()` method is called at each interval.
2.  It retrieves the list of tracked Tron addresses and all tracked TRC20 tokens via `TokenService.getTronTokens()`.
3.  Addresses are processed in batches.
4.  For each address in a batch, `processAddressTokenTransfers(address: string, tronTokens: any[])` is called.

**API Call for TRC20 Token Transfers:**
- **Method:** `GET`
- **Endpoint:** `{appConfig.tronScan.apiUrl}/api/token_trc20/transfers`
    - `appConfig.tronScan.apiUrl` typically defaults to `https://apilist.tronscanapi.com`.
- **Key Query Parameters:**
    - `relatedAddress`: `address` (the specific Tron account address being queried).
    - `start_timestamp`: `this.lastProcessedTokenTimestamp + 1` (fetches transfers since the last processed one, +1ms to avoid duplicates).
    - `limit`: `this.MAX_TRANSACTIONS_PER_REQUEST` (e.g., 50).
    - `direction`: `'in'` (fetches only incoming transfers to the `relatedAddress`).
    - `confirm`: `'0'` (fetches only confirmed transfers).

**Transfer Identification & Processing:**
1.  The API response is parsed.
2.  Each transfer event in the response data is passed to `processTokenTransfer(transfer: TronTransferEvent)`.
3.  `processTokenTransfer` then:
    - Extracts details (from, to, value, contract address, symbol, decimals, transaction hash, block number).
    - **Client-Side Token Filtering:** Although the API fetches all TRC20 transfers for the `relatedAddress`, the `processTokenTransfer` method (or subsequent logic in `NotificationService` or `eventHandler`) is implicitly expected to further filter/act based on whether the `transfer.contract_address` matches one of the `tronTokens` the system is actively interested in monitoring.
    - Calculates USD value using `TokenService`.
    - Sends a notification via `NotificationService.notifyDeposit()`.
    - Emits a `UnifiedTransferEvent` of type `ERC20` via the `eventHandler`.
4.  `lastProcessedTokenTimestamp` is updated to the timestamp of the latest transfer in the processed batch.

## Error Handling (Brief)

- **Consecutive Failures:** For native TRX polling (`checkForNewBlocks`), if `MAX_CONSECUTIVE_FAILURES` is reached, polling is paused for a short duration (e.g., 1 minute) before retrying.
- **Axios Errors:** For TRC20 polling (`processAddressTokenTransfers`), Axios errors are caught, and details (status, response data) are logged. Processing typically continues for other addresses. 