# Technical Specifications: Wallet Watcher Backend

This document details the technical implementation and current functionality of the Wallet Watcher backend, focusing on its real-time event tracking capabilities.

## Core Functionality

The primary function of this system is to monitor specified blockchain addresses (EVM-compatible chains for now) for native and ERC20 token transfers and to emit unified event notifications when such transfers occur to tracked addresses.

## Key Components and Architecture

The system is designed with a modular, class-based approach to manage different aspects of its operation:

### 1. `AddressManager` (`backend/src/services/address/addressManager.ts`)

*   **Purpose:** Centralized management of wallet addresses that need to be monitored.
*   **Storage:** Currently manages addresses in memory using a `Set<Hex>` for efficient lookups (e.g., `isTracking()`).
*   **Operations:**
    *   Initialization with an optional list of addresses.
    *   `updateAddresses(newAddresses: Hex[])`: Clears and re-populates the set of tracked addresses.
    *   `isTracking(address: Hex): boolean`: Checks if a given address is part of the tracked set.
    *   `getTrackedAddresses(): Hex[]`: Returns an array of all currently tracked addresses.
    *   `getTrackedAddressCount(): number`: Returns the number of tracked addresses.
*   **Design:** Intended to be extensible for future integration with persistent storage like Redis or a database for managing a larger scale of addresses.

### 2. `EvmConnectionManager` (`backend/src/services/websocket/evmConnectionManager.ts`)

*   **Purpose:** Manages WebSocket connections and event subscriptions for multiple EVM-compatible chains (e.g., Ethereum, Polygon, BSC) as configured.
*   **Dependencies:** Receives an `AddressManager` instance and an `EventHandlerCallback` during construction.
*   **Connections:** Uses `viem` library's `createPublicClient` with a `webSocket` transport to connect to chain providers specified in `appConfig`.
*   **Event Subscription & Filtering:**
    *   **Native Transfers:** Subscribes to new blocks on each chain using `client.watchBlocks()`. For each transaction in a block, it checks if the `to` address is tracked using `this.addressManager.isTracking()`.
    *   **ERC20 Transfers:** Subscribes to *all* ERC20 `Transfer` events on each chain using `client.watchEvent()` with a parsed ABI for the standard Transfer event: `parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')`.
        *   Client-side filtering is then performed: for each received `Transfer` log, it checks if `log.args.to` is a tracked address using `this.addressManager.isTracking()`.
*   **Event Emission:** When a relevant native or filtered ERC20 transfer is detected, it formats the data into a `UnifiedTransferEvent` (either `{ type: 'NATIVE', ... }` or `{ type: 'ERC20', ... }`) and invokes the `eventHandler` callback (provided by `WsConnectionManager`).
*   **Lifecycle Management:**
    *   `start()`: Initializes clients and sets up subscriptions for all configured EVM chains.
    *   `updateTrackedAddresses(newAddressesHint: Hex[], newEventHandler?: EventHandlerCallback | null)`: Primarily serves as a signal to re-establish subscriptions. It relies on the `AddressManager` instance having been updated externally. It can also update the event handler.
    *   `stop()`: Unsubscribes from all events and clears client instances.

### 3. `WsConnectionManager` (`backend/src/services/websocket/wsConnectionManager.ts`)

*   **Purpose:** Acts as the central orchestrator for all WebSocket-based connections and manages the overall lifecycle of address tracking and event handling.
*   **Core Components Managed:**
    *   Owns an `AddressManager` instance to manage the definitive list of tracked addresses.
    *   Owns an `EvmConnectionManager` instance (and will own a `TronConnectionManager` in the future).
*   **Address Loading & Refresh:**
    *   `fetchAddressesFromDB()`: A (currently mock) asynchronous function to simulate fetching addresses from a database. This is intended to be replaced with actual Prisma client logic.
    *   The constructor takes an optional `refreshIntervalMinutes` (defaulting to 5 minutes).
    *   `startConnections(initialAddresses?: Hex[])`: Initializes and starts the underlying connection managers (`EvmConnectionManager`).
        *   If `initialAddresses` are provided, they are loaded into the `AddressManager`.
        *   Otherwise, it calls `reloadAddressesFromDB()` to perform an initial load.
        *   If `refreshIntervalMinutes > 0`, it sets up a `setInterval` to periodically call `reloadAddressesFromDB()`.
    *   `reloadAddressesFromDB()`: Fetches the latest addresses from `fetchAddressesFromDB()` and updates the `AddressManager`. It then calls `updateConnectionsWithNewAddresses()`.
    *   `updateConnectionsWithNewAddresses(newAddresses: Hex[])`: Updates the `AddressManager` with the new list and signals the `EvmConnectionManager` (via its `updateTrackedAddresses` method) to refresh its subscriptions based on the updated list in `AddressManager`.
*   **Event Handling:**
    *   `setEventHandler(handler: EventHandlerCallback)`: Allows the main application to provide a callback function that will be invoked with `UnifiedTransferEvent` data when relevant transfers are detected by any of the managed connection services.
*   **Lifecycle Management:**
    *   `startConnections()`: Initializes and starts all configured connection managers and the periodic address refresh.
    *   `stopConnections()`: Stops all connection managers and clears the refresh interval.
*   **Shared Types:** Defines and exports crucial shared types used across the WebSocket services:
    *   `Erc20TransferEvent`, `NativeTransferEvent`, `UnifiedTransferEvent`, `EventHandlerCallback`.

## Data Flow for Event Detection (EVM Example)

1.  The main application instantiates `WsConnectionManager` and calls `setEventHandler()` with a handler function (e.g., from `wsEventHandler.ts`).
2.  `WsConnectionManager.startConnections()` is called.
    *   Addresses are loaded into `AddressManager` (either from an initial list or the mock `fetchAddressesFromDB`).
    *   `EvmConnectionManager` is instantiated with the `AddressManager` instance and the event handler.
    *   `EvmConnectionManager.start()` is called.
3.  `EvmConnectionManager` establishes WebSocket connections to configured EVM chains.
4.  It subscribes to new blocks (for native transfers) and all ERC20 `Transfer` events.
5.  **Scenario: Native Transfer**
    *   A new block arrives.
    *   `EvmConnectionManager` iterates through its transactions.
    *   For each transaction, it checks `if (this.addressManager.isTracking(tx.to))`. 
    *   If true, it constructs a `UnifiedTransferEvent` and calls the `eventHandler`.
6.  **Scenario: ERC20 Transfer**
    *   An ERC20 `Transfer` log is received from the WebSocket provider.
    *   `EvmConnectionManager` checks `if (this.addressManager.isTracking(log.args.to))`. 
    *   If true, it constructs a `UnifiedTransferEvent` and calls the `eventHandler`.
7.  **Periodic Address Update:**
    *   `WsConnectionManager`'s `setInterval` triggers `reloadAddressesFromDB()`.
    *   `fetchAddressesFromDB()` (mock) provides a new list of addresses.
    *   `AddressManager` is updated with this new list.
    *   `WsConnectionManager` calls `EvmConnectionManager.updateTrackedAddresses()`. This signals the `EvmConnectionManager` that the address list (accessible via its `AddressManager` instance) has changed, and it should ensure its filtering logic uses the most current list (in our case, by restarting its subscriptions which will then use the updated `AddressManager` for filtering).

## Future Considerations (Not Yet Implemented)

*   **`TronConnectionManager`:** Skeleton in place but needs full implementation for Tron network tracking.
*   **`wsEventHandler.ts`:** This file will contain the logic for what to *do* with the `UnifiedTransferEvent`s (e.g., send to Slack, write to DB).
*   **Database Integration:** The `fetchAddressesFromDB` in `WsConnectionManager` is currently a mock and needs to be replaced with actual Prisma (or other DB client) logic to fetch addresses from the application's database.
*   **Error Handling & Resilience:** While some basic error logging is present, robust error handling, reconnection strategies, and backoff mechanisms for WebSocket connections would be needed for a production system.
*   **Configuration for Thresholds/Notification Channels:** The `AddressManager` currently only stores addresses. Logic to associate and retrieve alert thresholds or specific notification channels per address/company is not yet part of this manager.

This specification reflects the state of the codebase as of the last update and will evolve as new features are added and existing ones are refined. 