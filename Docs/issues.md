# Project Issues Log

This document tracks known issues, bugs, and areas for improvement in the Wallet Watcher project.

## Active Issues

1.  **Slack Bot Token Expiration/Invalidation**
    *   **Description:** The `SLACK_BOT_TOKEN` can become invalid (e.g., reported as `token_expired`), preventing Slack notifications. This usually happens if the token is revoked or the app's installation in the workspace has an issue.
    *   **Status:** Active. Requires users to generate a new token and update the `.env` file.
    *   **Impact:** Critical for Slack notification functionality.

2.  **Polygon Native Token Symbol Discrepancy for Pricing**
    *   **Description:** Viem identifies Polygon's native currency symbol as "POL" (due to the recent upgrade), while the pricing mechanism in `TokenService` might expect "MATIC" or may not have price data for "POL". This can result in a `usdValue` of 0 for Polygon native transfers.
    *   **Status:** Partially Mitigated. A workaround has been implemented in `EvmConnectionManager.processNativeTransfers` to use "MATIC" for price lookups if "POL" is detected, but "POL" is still used for display.
    *   **Impact:** Medium. Affects USD value accuracy in notifications for Polygon native assets.
    *   **Next Steps:** Ensure `TokenService` can reliably fetch prices using "POL" or confirm "MATIC" is the standard for price feeds.

3.  **Alchemy API "Service Unavailable" Errors**
    *   **Description:** Occasional "Service Unavailable" errors have been observed from the Alchemy API when the `TokenService` attempts to fetch token balances or prices.
    *   **Status:** Active (intermittent).
    *   **Impact:** Low to Medium. Can temporarily prevent fetching token prices, leading to `usdValue: 0` in notifications. The system has some retry logic, but persistent issues would be problematic.
    *   **Location:** `TokenService` (price/balance fetching logic).

## Resolved Issues

1.  **Prisma Unique Constraint Error in TokenService**
    *   **Description:** An error occurred in `TokenService.getTokenByAddress` due to an incorrect unique constraint name (`address_chain_unique_constraint`) used with `prisma.tokenAddress.findUnique()`.
    *   **Status:** **Resolved**. Changed to `prisma.token.findFirst()` with appropriate `where` clause structure.
    *   **Resolution Date:** Approx. 2025-05-27 (based on conversation context).

2.  **BigInt Serialization in ConsoleNotifier**
    *   **Description:** `JSON.stringify` in `ConsoleNotifier` failed with the error "JSON.stringify cannot serialize BigInt" when trying to log notification data containing BigInt values.
    *   **Status:** **Resolved**. Implemented a replacer function in `JSON.stringify` to convert BigInts to strings.
    *   **Resolution Date:** Approx. 2025-05-27 (based on conversation context). 