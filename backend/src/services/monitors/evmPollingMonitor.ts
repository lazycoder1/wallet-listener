import {
    createPublicClient, http, webSocket,
    decodeEventLog, parseAbiItem, getContract, isAddress,
    formatUnits
} from 'viem';
import type {
    PublicClient, Filter, WatchContractEventReturnType, Hex, Abi,
    Log, Transaction, Block, Chain, AbiItem, DecodeEventLogReturnType, GetFilterChangesReturnType
} from 'viem';
import {
    mainnet, polygon, bsc // Add other chains from viem/chains as needed
} from 'viem/chains';
import { config as appConfig } from '../../config';
// Import types from orchestrator - these will need to be exported from wsConnectionManager.ts
import type { Erc20TransferEvent, NativeTransferEvent, UnifiedTransferEvent, EventHandlerCallback } from './chainMonitorManager';
import type { AddressManager } from '../address/addressManager'; // Import AddressManager type
import logger from '../../config/logger';
import { NotificationService } from '../notification/notificationService';
import { TokenService } from '../token/tokenService';

// ERC20 Transfer event ABI (this is the same for all ERC20 tokens)
const ERC20_TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
// ERC20 Transfer event topic
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// EVM Chain Configuration
interface EvmChain {
    viemChain: Chain; // Use the generic Chain type from viem
    httpUrl: string; // Changed from wsUrl to httpUrl
    name: string; // e.g., 'ethereum', 'polygon'
    id: number;
    pollingInterval: number; // in milliseconds
}

const evmChainsConfig: EvmChain[] = [
    { viemChain: mainnet, httpUrl: appConfig.networks.ethereum.httpRpcUrl!, name: 'Ethereum', id: mainnet.id, pollingInterval: 8000 },
    { viemChain: polygon, httpUrl: appConfig.networks.polygon.httpRpcUrl!, name: 'Polygon', id: polygon.id, pollingInterval: 2000 },
    { viemChain: bsc, httpUrl: appConfig.networks.bsc.httpRpcUrl!, name: 'BNB', id: bsc.id, pollingInterval: 3000 },
];

export class EvmPollingMonitor {
    private publicClients: Map<number, PublicClient> = new Map();
    private unsubscribeCallbacksMap: Map<number, Array<() => void>> = new Map();
    private addressManager: AddressManager; // Store AddressManager instance
    private eventHandler: EventHandlerCallback | null = null;
    private notificationService: NotificationService;
    private tokenService: TokenService;

    constructor(addressManager: AddressManager, handler: EventHandlerCallback | null) {
        this.addressManager = addressManager;
        this.eventHandler = handler;
        this.notificationService = NotificationService.getInstance();
        this.tokenService = TokenService.getInstance();
    }

    private getValidTrackedEvmAddresses(): Hex[] {
        const allAddresses = this.addressManager.getTrackedAddresses();
        // Log raw addresses from AddressManager for debugging listener setup
        // logger.info(`[EVM Setup] Raw addresses from AddressManager: ${JSON.stringify(allAddresses)}`); 
        const validEvmAddresses: Hex[] = [];
        for (const addr of allAddresses) {
            if (isAddress(addr)) {
                validEvmAddresses.push(addr.toLowerCase() as Hex);
            } else {
                const addrString = String(addr);
                if (addrString && (!addrString.startsWith('0x') || (addrString.startsWith('0x') && addrString.length !== 42))) {
                    logger.debug(`[EVM] Ignoring invalid or non-EVM address in getValidTrackedEvmAddresses: ${addrString}`);
                }
            }
        }
        // logger.info(`[EVM Setup] Filtered valid lowercase EVM addresses: ${JSON.stringify(validEvmAddresses)}`);
        return validEvmAddresses;
    }

    private initializeEvmClient(chain: EvmChain): PublicClient {
        if (!chain.httpUrl) {
            throw new Error(`HTTP RPC URL for ${chain.name} is not configured.`);
        }
        logger.info(`Initializing EVM client for ${chain.name} on ${chain.httpUrl} with polling interval ${chain.pollingInterval}ms`);
        const client = createPublicClient({
            chain: chain.viemChain,
            transport: http(chain.httpUrl),
            batch: {
                multicall: true, // Enable multicall for performance optimization
            },
        });
        this.publicClients.set(chain.id, client);
        return client;
    }

    private startBlockScanner(
        client: PublicClient,
        chain: EvmChain,
    ) {
        logger.info(`[${chain.name}] Setting up unified block scanner.`);

        let lastProcessedBlock: bigint | null = null;

        const unwatch = client.watchBlocks({
            onBlock: async (block) => {
                if (!this.eventHandler) {
                    logger.warn("Event handler not set, skipping event processing in onBlock.");
                    return;
                }
                const handler = this.eventHandler;

                if (!block || !block.number) {
                    logger.warn(`[${chain.name}] Received a block without a number in watchBlocks. Skipping.`);
                    return;
                }

                // Simple check to avoid reprocessing the same block if watchBlocks fires multiple times
                if (block.number === lastProcessedBlock) {
                    logger.debug(`[${chain.name}] Already processed block ${block.number}. Skipping.`);
                    return;
                }

                try {
                    const blockNumberForLog = block.number.toString();
                    logger.debug(`[${chain.name}] Processing block ${blockNumberForLog}.`);

                    // 1. Fetch all ERC20 transfer logs for the block more efficiently
                    const logs = await client.getLogs({
                        fromBlock: block.number,
                        toBlock: block.number,
                        event: ERC20_TRANSFER_EVENT
                    });

                    if (logs && logs.length > 0) {
                        logger.debug(`[${chain.name}] Found ${logs.length} ERC20 transfer logs in block ${blockNumberForLog}.`);
                        await this.processErc20TransferLogs(logs, chain, handler);
                    }

                    // 2. Get full block ONLY for native transfers if needed
                    const trackedAddresses = this.addressManager.getTrackedAddresses();
                    if (trackedAddresses.length > 0) {
                        const fullBlock = await client.getBlock({
                            blockNumber: block.number,
                            includeTransactions: true
                        });
                        if (fullBlock?.transactions && fullBlock.transactions.length > 0) {
                            this.processNativeTransfers(fullBlock.transactions, chain, handler);
                        }
                    }

                    lastProcessedBlock = block.number;

                } catch (error) {
                    const blockNumberForErrorLog = block && block.number ? block.number.toString() : 'unknown block';
                    logger.error(`[${chain.name}] Error processing block ${blockNumberForErrorLog}:`, error);
                }
            },
            onError: (error: Error) => {
                logger.error(`[${chain.name}] Error watching blocks:`, error);
                logger.error(`[${chain.name}] Full error object during block watching: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
            },
            pollingInterval: chain.pollingInterval,
            poll: true,
        });
        const currentUnsubs = this.unsubscribeCallbacksMap.get(chain.id) || [];
        currentUnsubs.push(unwatch);
        this.unsubscribeCallbacksMap.set(chain.id, currentUnsubs);
    }

    private async processNativeTransfers(
        transactions: Transaction[],
        chain: EvmChain,
        handler: EventHandlerCallback
    ) {
        const validTrackedAddresses = this.getValidTrackedEvmAddresses();
        // Log addresses used for filtering native transfers
        // logger.info(`[${chain.name} - Native] Addresses used for filtering: ${JSON.stringify(validTrackedAddresses)}`);
        if (validTrackedAddresses.length === 0) {
            // logger.info(`[${chain.name} - Native] No valid EVM addresses to filter against. Skipping processing.`);
            return;
        }

        const relevantTransactions = transactions.filter(tx =>
            tx.to && validTrackedAddresses.includes(tx.to.toLowerCase() as Hex)
        );
        for (const tx of relevantTransactions) {
            if (tx.blockNumber && tx.from && tx.to && tx.value && tx.hash) {
                logger.debug(`[${chain.name}] Native transfer to ${tx.to}:`, {
                    from: tx.from,
                    to: tx.to,
                    value: tx.value.toString(),
                    hash: tx.hash
                });
                const nativeSymbol = chain.viemChain.nativeCurrency.symbol;
                const nativeDecimals = chain.viemChain.nativeCurrency.decimals;

                // Handle Polygon native token symbol for price lookup
                let symbolForPriceLookup = nativeSymbol;
                if (chain.id === polygon.id && nativeSymbol.toUpperCase() === 'POL') {
                    logger.info(`[${chain.name}] Native symbol is POL, using MATIC for price lookup.`);
                    symbolForPriceLookup = 'MATIC';
                }

                const tokenData = await this.tokenService.getToken(symbolForPriceLookup, chain.name.toLowerCase());
                const tokenPrice = tokenData?.price || 0;
                const formattedTxValue = formatUnits(tx.value, nativeDecimals);
                const usdValue = tokenPrice ? parseFloat(formattedTxValue) * tokenPrice : 0;
                await this.notificationService.notifyDeposit(
                    tx.to.toLowerCase() as Hex,
                    tx.value.toString(),
                    formattedTxValue,
                    nativeSymbol,
                    nativeDecimals,
                    'NATIVE',
                    usdValue,
                    tx.hash,
                    tx.from.toLowerCase() as Hex,
                    tx.blockNumber,
                    {
                        chainId: chain.id,
                        chainName: chain.name,
                        chainType: 'EVM',
                    }
                );
                handler({
                    type: 'NATIVE',
                    chainId: chain.id,
                    data: {
                        to: tx.to.toLowerCase() as Hex,
                        from: tx.from.toLowerCase() as Hex,
                        value: tx.value,
                        hash: tx.hash,
                        blockNumber: tx.blockNumber,
                    }
                });
            }
        }
    }

    private async processErc20TransferLogs(
        logs: Log[],
        chain: EvmChain,
        handler: EventHandlerCallback
    ) {
        const validTrackedAddresses = this.getValidTrackedEvmAddresses();
        if (validTrackedAddresses.length === 0) {
            return; // No addresses to check against
        }

        const relevantLogs = logs.filter(log => {
            // Topic[0] is the event signature. Topic[2] is the 'to' address for Transfer events.
            return log.topics[0]?.toLowerCase() === TRANSFER_EVENT_TOPIC.toLowerCase() &&
                log.topics[2] &&
                validTrackedAddresses.some(trackedAddr =>
                    log.topics[2]?.toLowerCase().includes(trackedAddr.substring(2).toLowerCase())
                );
        });

        for (const log of relevantLogs) {
            try {
                const decodedLog = decodeEventLog({
                    abi: [ERC20_TRANSFER_EVENT],
                    data: log.data,
                    topics: log.topics,
                });
                const toAddress = decodedLog.args.to.toLowerCase() as Hex;
                if (!this.addressManager.isTracking(toAddress)) {
                    logger.warn(`[${chain.name}] ERC20 log for ${toAddress} was not in AddressManager's list despite filter.`);
                    continue;
                }
                logger.debug(`[${chain.name}] ERC20 Transfer to ${toAddress}:`, {
                    from: decodedLog.args.from,
                    to: toAddress,
                    value: decodedLog.args.value.toString(),
                    tokenContract: log.address
                });
                const tokenData = await this.tokenService.getTokenByAddress(
                    chain.name.toLowerCase(),
                    log.address.toLowerCase()
                );

                // Only track and notify for known tokens that we have in our database
                if (!tokenData) {
                    // Log unknown token for future reference, but don't send notification
                    const formattedValue = formatUnits(decodedLog.args.value, 18); // Use default 18 decimals for logging
                    logger.info(`[${chain.name}] Unknown ERC20 token transfer detected:`, {
                        tokenContract: log.address.toLowerCase(),
                        to: toAddress,
                        from: decodedLog.args.from.toLowerCase(),
                        amount: formattedValue,
                        transactionHash: log.transactionHash,
                        blockNumber: log.blockNumber,
                        chainId: chain.id
                    });
                    continue; // Skip notification for unknown tokens
                }

                const tokenSymbol = tokenData.symbol;
                const tokenDecimals = tokenData.decimals;
                const tokenPrice = tokenData.price || 0;
                const formattedLogValue = formatUnits(decodedLog.args.value, tokenDecimals);
                const usdValue = tokenPrice ? parseFloat(formattedLogValue) * tokenPrice : 0;

                if (log.transactionHash && log.blockNumber) {
                    await this.notificationService.notifyDeposit(
                        toAddress,
                        decodedLog.args.value.toString(),
                        formattedLogValue,
                        tokenSymbol,
                        tokenDecimals,
                        log.address.toLowerCase() as Hex,
                        usdValue,
                        log.transactionHash,
                        decodedLog.args.from.toLowerCase() as Hex,
                        log.blockNumber,
                        {
                            chainId: chain.id,
                            chainName: chain.name,
                            chainType: 'EVM',
                            tokenContractAddress: log.address
                        }
                    );
                }
                if (log.transactionHash && log.blockNumber !== null && log.logIndex !== null) {
                    handler({
                        type: 'ERC20',
                        chainId: chain.id,
                        data: {
                            from: decodedLog.args.from.toLowerCase() as Hex,
                            to: toAddress,
                            value: decodedLog.args.value,
                            transactionHash: log.transactionHash,
                            blockNumber: log.blockNumber,
                            logIndex: log.logIndex,
                            tokenContract: log.address.toLowerCase() as Hex
                        }
                    });
                }
            } catch (error) {
                logger.error(`[${chain.name}] Error processing ERC20 transfer log:`, error);
            }
        }
    }

    public start(): void {
        const initialAddressesRaw = this.addressManager.getTrackedAddresses();
        const initialValidEvmAddresses = this.getValidTrackedEvmAddresses();
        logger.info({
            message: "Starting EVM polling connections...",
            totalTrackedByManager: initialAddressesRaw.length,
            rawAddressesFromManager: JSON.stringify(initialAddressesRaw), // Log all addresses from manager
            validEvmAddressesForListeners: JSON.stringify(initialValidEvmAddresses), // Log addresses used by EVM listeners
            managerInstanceId: this.addressManager // Potentially log instance ID if AddressManager has one
        });

        if (!this.eventHandler) {
            logger.warn("Event handler not set for EvmPollingMonitor. Events might be missed.");
        }
        evmChainsConfig.forEach(chain => {
            try {
                const client = this.initializeEvmClient(chain);
                this.startBlockScanner(client, chain);
            } catch (error) {
                logger.error(`Failed to initialize or subscribe to ${chain.name}:`, error);
            }
        });
    }

    private updateConnections(newEventHandler?: EventHandlerCallback | null) {
        const currentAddressesRaw = this.addressManager.getTrackedAddresses();
        const currentValidEvmAddresses = this.getValidTrackedEvmAddresses();
        logger.info({
            message: "EvmPollingMonitor: Updating connections...",
            totalTrackedByManager: currentAddressesRaw.length,
            rawAddressesFromManager: JSON.stringify(currentAddressesRaw),
            validEvmAddressesForListeners: JSON.stringify(currentValidEvmAddresses)
        });

        if (newEventHandler !== undefined) {
            this.eventHandler = newEventHandler;
        }

        // Gracefully unsubscribe from all existing watchers
        this.unsubscribeCallbacksMap.forEach((unsubs, chainId) => {
            logger.debug(`Unsubscribing from ${unsubs.length} watchers for chain ${chainId}`);
            unsubs.forEach((unsub, index) => {
                try {
                    unsub();
                } catch (error: any) {
                    // This can happen if the filter has already expired on the RPC node.
                    // Common errors: "filter not found", "eth_uninstallFilter" failures
                    // It's safe to ignore as we are about to create new filters anyway.
                    if (error?.message?.includes('filter not found') ||
                        error?.message?.includes('eth_uninstallFilter') ||
                        error?.code === 32000) {
                        logger.debug(`Filter ${index} for chain ${chainId} already expired/removed. This is normal.`);
                    } else {
                        logger.warn(`Unexpected error during unsubscribe for chain ${chainId}, filter ${index}:`, {
                            message: error?.message,
                            code: error?.code,
                            details: error?.details
                        });
                    }
                }
            });
        });

        this.unsubscribeCallbacksMap.clear();

        if (!this.eventHandler) {
            logger.warn("Event handler not set for EvmPollingMonitor during update. Events might be missed.");
        }
        evmChainsConfig.forEach(chain => {
            const client = this.publicClients.get(chain.id);
            if (client) {
                this.startBlockScanner(client, chain);
            } else {
                logger.warn(`EVM Client for ${chain.name} not found during update. Re-initializing.`);
                try {
                    const newClient = this.initializeEvmClient(chain);
                    this.startBlockScanner(newClient, chain);
                } catch (error) {
                    logger.error(`Failed to re-initialize or subscribe to ${chain.name} during update:`, error);
                }
            }
        });
    }

    public updateTrackedAddresses(newAddressesHint: Hex[], newEventHandler?: EventHandlerCallback | null) {
        logger.info("EvmPollingMonitor: Received address update hint (will re-evaluate from AddressManager). Hint count:", newAddressesHint.length);
        this.updateConnections(newEventHandler);
    }

    public stop() {
        logger.info("Stopping EVM polling connections...");
        this.unsubscribeCallbacksMap.forEach((unsubs, chainId) => {
            logger.info(`Unsubscribing from ${unsubs.length} watchers for EVM chain ID: ${chainId}`);
            unsubs.forEach((unsub, index) => {
                try {
                    unsub();
                } catch (error: any) {
                    // This can happen if the filter has already expired on the RPC node.
                    // Common errors: "filter not found", "eth_uninstallFilter" failures
                    // It's safe to ignore as we are shutting down.
                    if (error?.message?.includes('filter not found') ||
                        error?.message?.includes('eth_uninstallFilter') ||
                        error?.code === 32000) {
                        logger.debug(`Filter ${index} for chain ${chainId} already expired/removed during shutdown. This is normal.`);
                    } else {
                        logger.warn(`Unexpected error during shutdown unsubscribe for chain ${chainId}, filter ${index}:`, {
                            message: error?.message,
                            code: error?.code,
                            details: error?.details
                        });
                    }
                }
            });
        });
        this.unsubscribeCallbacksMap.clear();
        this.publicClients.forEach((client, chainId) => {
            logger.info(`Stopping client for chain ${chainId}`);
        });
        logger.info('EVM polling connections stopped.');
    }
}
