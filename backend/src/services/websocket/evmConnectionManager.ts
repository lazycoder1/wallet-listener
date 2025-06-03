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
import type { UnifiedTransferEvent, EventHandlerCallback } from './wsConnectionManager';
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
    wsUrl: string;
    name: string; // e.g., 'ethereum', 'polygon'
    id: number;
}

const evmChainsConfig: EvmChain[] = [
    { viemChain: mainnet, wsUrl: appConfig.networks.ethereum.wsUrl, name: 'Ethereum', id: mainnet.id },
    { viemChain: polygon, wsUrl: appConfig.networks.polygon.wsUrl, name: 'Polygon', id: polygon.id },
    { viemChain: bsc, wsUrl: appConfig.networks.bsc.wsUrl, name: 'BNB', id: bsc.id },
];

export class EvmConnectionManager {
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
                    logger.warn(`[EVM] Ignoring invalid or non-EVM address in getValidTrackedEvmAddresses: ${addrString}`);
                }
            }
        }
        // logger.info(`[EVM Setup] Filtered valid lowercase EVM addresses: ${JSON.stringify(validEvmAddresses)}`);
        return validEvmAddresses;
    }

    private initializeEvmClient(chain: EvmChain): PublicClient {
        if (!chain.wsUrl) {
            throw new Error(`WebSocket URL for ${chain.name} is not configured.`);
        }
        logger.info(`Initializing EVM client for ${chain.name} on ${chain.wsUrl}`);
        const client = createPublicClient({
            chain: chain.viemChain,
            transport: webSocket(chain.wsUrl, {
                timeout: 60_000,
            }),
            batch: {
                multicall: true, // Enable multicall for performance optimization
            },
        });
        this.publicClients.set(chain.id, client);
        return client;
    }

    private watchNativeTransfers(
        client: PublicClient,
        chain: EvmChain,
    ) {
        const currentTrackedCount = this.addressManager.getTrackedAddressCount();
        logger.info(`[${chain.name}] Setting up native transfer watching. Current tracked address count: ${currentTrackedCount}`);
        // Potentially log addresses here if needed, but getValidTrackedEvmAddresses is called inside processNativeTransfers

        if (currentTrackedCount === 0) {
            logger.info(`[${chain.name}] No addresses tracked by AddressManager. Native transfer watching will be passive until addresses are added.`);
        }

        const unwatch = client.watchBlocks({
            onBlock: async (block) => {
                if (!this.eventHandler) {
                    logger.warn("Event handler not set, skipping event processing in onBlock.");
                    return;
                }
                const handler = this.eventHandler;
                if (!block || !block.hash) {
                    logger.warn(`[${chain.name}] Received a block without a hash in watchBlocks. Skipping.`);
                    return;
                }
                try {
                    const fullBlock = await client.getBlock({
                        blockHash: block.hash,
                        includeTransactions: true
                    });
                    if (!fullBlock || !fullBlock.transactions || fullBlock.transactions.length === 0) {
                        const blockNumberForLog = block.number ? block.number.toString() : 'unknown';
                        // logger.info(`[${chain.name}] Block ${blockNumberForLog} (hash: ${block.hash}) has no transactions or fullBlock details are missing.`);
                        return;
                    }
                    this.processNativeTransfers(fullBlock.transactions, chain, handler);
                } catch (error) {
                    const blockNumberForErrorLog = block && block.number ? block.number.toString() : (block && block.hash ? `hash ${block.hash}` : 'unknown block');
                    logger.error(`[${chain.name}] Error processing block ${blockNumberForErrorLog}:`, error);
                }
            },
            onError: (error: Error) => {
                logger.error(`[${chain.name}] Error watching blocks:`, error);
                // Add more detailed logging
                logger.error(`[${chain.name}] Full error object during block watching: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
            }
        });
        const currentUnsubs = this.unsubscribeCallbacksMap.get(chain.id) || [];
        currentUnsubs.push(unwatch);
        this.unsubscribeCallbacksMap.set(chain.id, currentUnsubs);
    }

    private watchErc20Transfers(
        client: PublicClient,
        chain: EvmChain,
    ) {
        const validTrackedAddresses = this.getValidTrackedEvmAddresses();
        logger.info(`[${chain.name}] Addresses used for ERC20 'to' filter: ${JSON.stringify(validTrackedAddresses)}`);

        if (validTrackedAddresses.length === 0) {
            logger.info(`[${chain.name}] No valid EVM addresses are currently tracked. Skipping ERC20 Transfer event watch setup for this chain.`);
            return;
        }
        logger.info(`[${chain.name}] Setting up ERC20 Transfer event watch for ${validTrackedAddresses.length} valid tracked EVM addresses.`);
        const unwatch = client.watchEvent({
            event: ERC20_TRANSFER_EVENT,
            onLogs: async (logs) => {
                if (!this.eventHandler) {
                    logger.warn("Event handler not set, skipping ERC20 transfer processing.");
                    return;
                }
                await this.processErc20TransferLogs(logs, chain, this.eventHandler);
            },
            onError: (error) => {
                logger.error(`[${chain.name}] Error watching ERC20 transfers:`, error);
                // Add more detailed logging
                logger.error(`[${chain.name}] Full error object during ERC20 watching: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
            },
            args: {
                to: validTrackedAddresses,
            },
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
        // validTrackedAddresses is implicitly used by the watchEvent filter, but if needed for direct check:
        // const validTrackedAddresses = this.getValidTrackedEvmAddresses(); 
        // logger.info(`[${chain.name} - ERC20] Addresses considered for tracking: ${JSON.stringify(validTrackedAddresses)}`);

        for (const log of logs) {
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
                const tokenSymbol = tokenData?.symbol || 'UNKNOWN_ERC20';
                const tokenDecimals = tokenData?.decimals || 18;
                const tokenPrice = tokenData?.price || 0;
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

    public start() {
        const initialAddressesRaw = this.addressManager.getTrackedAddresses();
        const initialValidEvmAddresses = this.getValidTrackedEvmAddresses();
        logger.info({
            message: "Starting EVM WebSocket connections...",
            totalTrackedByManager: initialAddressesRaw.length,
            rawAddressesFromManager: JSON.stringify(initialAddressesRaw), // Log all addresses from manager
            validEvmAddressesForListeners: JSON.stringify(initialValidEvmAddresses), // Log addresses used by EVM listeners
            managerInstanceId: this.addressManager // Potentially log instance ID if AddressManager has one
        });

        if (!this.eventHandler) {
            logger.warn("Event handler not set for EvmConnectionManager. Events might be missed.");
        }
        evmChainsConfig.forEach(chain => {
            try {
                const client = this.initializeEvmClient(chain);
                this.watchNativeTransfers(client, chain);
                this.watchErc20Transfers(client, chain);
            } catch (error) {
                logger.error(`Failed to initialize or subscribe to ${chain.name}:`, error);
            }
        });
    }

    public updateConnections(newEventHandler?: EventHandlerCallback | null) {
        const currentAddressesRaw = this.addressManager.getTrackedAddresses();
        const currentValidEvmAddresses = this.getValidTrackedEvmAddresses();
        logger.info({
            message: "EvmConnectionManager: Updating connections...",
            totalTrackedByManager: currentAddressesRaw.length,
            rawAddressesFromManager: JSON.stringify(currentAddressesRaw),
            validEvmAddressesForListeners: JSON.stringify(currentValidEvmAddresses)
        });

        if (newEventHandler !== undefined) {
            this.eventHandler = newEventHandler;
        }
        this.unsubscribeCallbacksMap.forEach(unsubs => unsubs.forEach(unsub => unsub()));
        this.unsubscribeCallbacksMap.clear();
        if (!this.eventHandler) {
            logger.warn("Event handler not set for EvmConnectionManager during update. Events might be missed.");
        }
        evmChainsConfig.forEach(chain => {
            const client = this.publicClients.get(chain.id);
            if (client) {
                this.watchNativeTransfers(client, chain);
                this.watchErc20Transfers(client, chain);
            } else {
                logger.warn(`EVM Client for ${chain.name} not found during update. Re-initializing.`);
                try {
                    const newClient = this.initializeEvmClient(chain);
                    this.watchNativeTransfers(newClient, chain);
                    this.watchErc20Transfers(newClient, chain);
                } catch (error) {
                    logger.error(`Failed to re-initialize or subscribe to ${chain.name} during update:`, error);
                }
            }
        });
    }

    public updateTrackedAddresses(newAddressesHint: Hex[], newEventHandler?: EventHandlerCallback | null) {
        logger.info("EvmConnectionManager: Received address update hint (will re-evaluate from AddressManager). Hint count:", newAddressesHint.length);
        this.updateConnections(newEventHandler);
    }

    public stop() {
        logger.info("Stopping EVM WebSocket connections...");
        this.unsubscribeCallbacksMap.forEach((unsubs, chainId) => {
            logger.info(`Unsubscribing from EVM chain ID: ${chainId}`);
            unsubs.forEach(unsub => unsub());
        });
        this.unsubscribeCallbacksMap.clear();
        this.publicClients.forEach((client, chainId) => {
            logger.info(`Clearing EVM client for chain ID: ${chainId}`);
        });
        this.publicClients.clear();
        logger.info("All EVM subscriptions stopped and clients cleared.");
    }
} 