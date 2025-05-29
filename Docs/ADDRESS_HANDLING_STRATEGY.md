# Address Handling Strategy for EVM and Tron Chains

This document outlines the strategy for handling, storing, validating, and comparing blockchain addresses for both EVM-compatible chains and the Tron network within the Wallet Watcher application. The goal is to ensure accuracy and reliability in transaction monitoring.

## Core Principles

1.  **Chain Specificity:** Address formats and validation rules are specific to their respective blockchains (EVM vs. Tron). An address string is assumed to belong to either EVM *or* Tron, not both.
2.  **Source of Addresses:** The `AddressManager` service is the primary source for the list of wallet addresses to be monitored.
3.  **Chain Manager Responsibility:**
    *   The `EvmConnectionManager` is responsible for handling addresses intended for EVM chains.
    *   The `TronConnectionManager` is responsible for handling addresses intended for the Tron network.
    *   Each manager will validate and normalize addresses received from `AddressManager` according to its chain's rules.
4.  **Internal Consistency:** Each connection manager will maintain a consistent internal format for the addresses it actively tracks and uses for lookups.
5.  **Unified Event Consistency:** When reporting transactions through the `UnifiedTransferEvent`, addresses should be converted to a common hex format (e.g., `0x...`) where appropriate, ensuring correct representation for each chain.
6.  **Address Refresh:** The `AddressManager` may periodically refresh its list of tracked addresses (e.g., from a database). Connection managers should be capable of updating their internal tracking sets based on these refreshes.

## EVM Address Handling

*   **Standard Format:** `0x` prefixed hexadecimal string (e.g., `0x742d35cC6634C0532925a3b844Bc454e4438f44e`).
*   **Case Sensitivity:** EVM addresses are **case-insensitive** in practice.
*   **Storage Strategy (Recommended):**
    *   Within `AddressManager` or the database: Store as is, or consistently as lowercase.
    *   Within `EvmConnectionManager`'s internal tracking sets (e.g., for event filters or lookups): Convert to and store as **lowercase strings** (e.g., `0x742d35cc6634c0532925a3b844bc454e4438f44e`).
*   **Comparison/Lookup Strategy:**
    *   When comparing an address from an API response (or any external source) with internally tracked EVM addresses, convert **both** to lowercase before the comparison to ensure accurate matching.
*   **Validation:** Use standard EVM address validation utilities (e.g., `isAddress` from `viem` or `ethers.js`).
*   **Unified Event Format:** Already in the desired `0x...` hex format.

## Tron Address Handling

Tron addresses have two common representations: Base58 and Hex.

*   **1. Base58 Format:**
    *   **Standard Format:** Starts with `T` (e.g., `TJRyWhh1sCeHArNMerdvE1N9wyqLFsrRVu`). This is the most common user-facing format.
    *   **Case Sensitivity:** Tron Base58 addresses are **CASE-SENSITIVE**. `Tabc...` is different from `tabc...`.
*   **2. Hex Format:**
    *   **Standard Format:** Starts with `41` (e.g., `415a4128926568026057d9357a8b1f82199b03a43f`). This is the underlying hex representation of the Base58 address.
    *   **Case Sensitivity:** Hexadecimal strings are generally **case-insensitive**. `tronWeb.address.fromHex()` can typically handle mixed-case `41...` inputs.

*   **Storage Strategy (within `TronConnectionManager`'s internal tracking sets):**
    *   Store as valid, **correctly-cased Base58 strings** (e.g., `TJRyWhh1sCeHArNMerdvE1N9wyqLFsrRVu`). This ensures that when an address is used with `tronWeb` functions that expect Base58, it's in the correct, valid format.

*   **Normalization and Validation (within `TronConnectionManager`):**
    *   When `TronConnectionManager` receives address strings from `AddressManager`, it will use an internal utility (e.g., `normalizeAndValidateTronAddress`):
        1.  **Input:** An address string.
        2.  **Process:**
            *   If the input string is a valid Tron Base58 address (starts with `T`, correct length, passes `tronWeb.isAddress()` which is case-sensitive): Use it as is.
            *   If the input string is a Tron hex address (starts with `41`, correct length): Convert it to its Base58 representation using `tronWeb.address.fromHex()`. Validate the result with `tronWeb.isAddress()`.
            *   If the input is an EVM-style hex address (`0x...` not starting with `0x41...`) or any other unrecognized/invalid format: It is considered **not relevant for Tron monitoring**. Log this (e.g., "Ignoring non-Tron address for Tron operations: [addressInput]") and discard it for Tron operations (e.g., the utility returns `null`).
        3.  **Output:** A valid, correctly-cased Tron Base58 address string, or `null` if the input is not a recognizable/valid Tron address.
    *   Internally tracked sets (e.g., `trackedWalletAddressesSet`) in `TronConnectionManager` will only contain these validated Base58 addresses.

*   **Comparison/Lookup Strategy (within `TronConnectionManager`):**
    *   **Against API Hex Addresses (e.g., from block data):** Convert the API's hex address (e.g., `41...`) to Base58 using `tronWeb.address.fromHex()`. Then compare this result with the internally stored Base58 addresses.
    *   **Against API Base58 Addresses (e.g., from TRC20 transfer events):** Validate the API's Base58 address using `tronWeb.isAddress()` (to ensure it's valid and correctly cased). Then compare directly with the internally stored Base58 addresses.
    *   **Key Value Search:** Yes, essentially, for efficient lookup, addresses are stored in `Set`s. The critical part is ensuring the addresses being added to the `Set` and the addresses being checked against the `Set` are in the same, valid, and (for Tron Base58) correctly-cased format.

*   **Unified Event Format:**
    *   When a Tron address (internally stored as Base58, e.g., `TJRy...`) needs to be included in the `UnifiedTransferEvent` (which might use a `Hex` type like `0x...`):
        1.  Convert the Base58 address to its `41...` hex representation using `tronWeb.address.toHex('TJRy...')`.
        2.  Prepend `0x` to this `41...` string. Example: `('0x' + tronWeb.address.toHex('TJRy...')) as Hex`. This results in `0x41...`.

## Summary of Address Management in Code

*   **`AddressManager`:** Holds the primary list of address strings to be monitored, without inherent chain-type assumptions visible to its direct consumers (unless this is changed architecturally later).
*   **`EvmConnectionManager`:**
    *   Receives addresses.
    *   Filters for/validates EVM addresses.
    *   Normalizes them to lowercase for internal use and comparison.
*   **`TronConnectionManager`:**
    *   Receives addresses.
    *   Uses `normalizeAndValidateTronAddress` to:
        *   Identify and validate Tron Base58 (`T...`) and Tron Hex (`41...`) addresses.
        *   Convert valid Tron Hex to correctly-cased Base58.
        *   Store only valid, correctly-cased Base58 addresses internally.
        *   Ignore EVM (`0x...`) and other non-Tron addresses.
    *   Handles case-sensitivity correctly for all Tron operations.
    *   Converts to `0x41...` format for `UnifiedTransferEvent`.

This strategy allows each connection manager to operate correctly according to its chain's specific address rules while ensuring that addresses sourced from `AddressManager` are appropriately filtered and handled. 