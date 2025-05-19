import {
    createPublicClient, http, webSocket,
    decodeEventLog, parseAbiItem
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
    { viemChain: bsc, wsUrl: appConfig.networks.bsc.wsUrl, name: 'BSC', id: bsc.id },
];

export class EvmConnectionManager {
    private publicClients: Map<number, PublicClient> = new Map();
    private unsubscribeCallbacksMap: Map<number, Array<() => void>> = new Map();
    private addressManager: AddressManager; // Store AddressManager instance
    private eventHandler: EventHandlerCallback | null = null;

    constructor(addressManager: AddressManager, handler: EventHandlerCallback | null) {
        this.addressManager = addressManager;
        this.eventHandler = handler;
    }

    private initializeEvmClient(chain: EvmChain): PublicClient {
        if (!chain.wsUrl) {
            throw new Error(`WebSocket URL for ${chain.name} is not configured.`);
        }
        console.log(`Initializing EVM client for ${chain.name} on ${chain.wsUrl}`);
        const client = createPublicClient({
            chain: chain.viemChain,
            transport: webSocket(chain.wsUrl, {
                timeout: 60_000,
            }),
        });
        this.publicClients.set(chain.id, client);
        return client;
    }

    private async subscribeToBlocks(
        client: PublicClient,
        chain: EvmChain,
    ) {
        if (this.addressManager.getTrackedAddressCount() === 0) return;

        const unwatch = client.watchBlocks({
            onBlock: async (block) => {
                if (!this.eventHandler) {
                    console.warn("Event handler not set, skipping event processing in onBlock.");
                    return;
                }
                const handler = this.eventHandler;

                try {
                    // Get full block details including transactions
                    const fullBlock = await client.getBlock({
                        blockHash: block.hash,
                        includeTransactions: true
                    });

                    console.log(fullBlock);

                    if (!fullBlock.transactions || fullBlock.transactions.length === 0) return;

                    // Process native transfers from transactions
                    this.processNativeTransfers(fullBlock.transactions, chain, handler);

                    // Only fetch logs if we have transactions
                    const logs = await client.getLogs({
                        blockHash: block.hash
                    });

                    // Process ERC20 transfers from logs
                    this.processErc20Transfers(logs, chain, handler);

                } catch (error) {
                    console.error(`[${chain.name}] Error processing block ${block.number}:`, error);
                }
            },
            onError: (error: Error) => {
                console.error(`[${chain.name}] Error watching blocks:`, error);
            }
        });

        const currentUnsubs = this.unsubscribeCallbacksMap.get(chain.id) || [];
        currentUnsubs.push(unwatch);
        this.unsubscribeCallbacksMap.set(chain.id, currentUnsubs);
    }

    private processNativeTransfers(
        transactions: Transaction[],
        chain: EvmChain,
        handler: EventHandlerCallback
    ) {
        for (const tx of transactions) {
            if (tx.to && this.addressManager.isTracking(tx.to.toLowerCase() as Hex)) {
                if (tx.blockNumber && tx.from && tx.to && tx.value && tx.hash) {
                    console.log(`[${chain.name}] Native transfer to ${tx.to}:`, {
                        from: tx.from,
                        to: tx.to,
                        value: tx.value.toString(),
                        hash: tx.hash
                    });

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
    }

    private processErc20Transfers(
        logs: Log[],
        chain: EvmChain,
        handler: EventHandlerCallback
    ) {
        for (const log of logs) {
            try {
                // Check if it's a Transfer event
                if (log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') { // Transfer event signature
                    const decodedLog = decodeEventLog({
                        abi: [parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')],
                        data: log.data,
                        topics: log.topics,
                    });

                    if (decodedLog.args.to && this.addressManager.isTracking(decodedLog.args.to.toLowerCase() as Hex)) {
                        console.log(`[${chain.name}] ERC20 Transfer to ${decodedLog.args.to}:`, {
                            from: decodedLog.args.from,
                            to: decodedLog.args.to,
                            value: decodedLog.args.value.toString(),
                            tokenContract: log.address
                        });

                        if (log.transactionHash && log.blockNumber !== null && log.logIndex !== null) {
                            handler({
                                type: 'ERC20',
                                chainId: chain.id,
                                data: {
                                    from: decodedLog.args.from.toLowerCase() as Hex,
                                    to: decodedLog.args.to.toLowerCase() as Hex,
                                    value: decodedLog.args.value,
                                    transactionHash: log.transactionHash,
                                    blockNumber: log.blockNumber,
                                    logIndex: log.logIndex,
                                    tokenContract: log.address.toLowerCase() as Hex
                                }
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`[${chain.name}] Error processing log:`, error);
            }
        }
    }

    public start() {
        console.log("Starting EVM WebSocket connections. Monitored addresses via AddressManager count:", this.addressManager.getTrackedAddressCount());
        if (!this.eventHandler) {
            console.warn("Event handler not set for EvmConnectionManager. Events might be missed.");
        }
        evmChainsConfig.forEach(chain => {
            try {
                const client = this.initializeEvmClient(chain);
                this.subscribeToBlocks(client, chain);
            } catch (error) {
                console.error(`Failed to initialize or subscribe to ${chain.name}:`, error);
            }
        });
    }

    public updateConnections(newEventHandler?: EventHandlerCallback | null) {
        console.log("EvmConnectionManager: Updating connections. Current tracked address count:", this.addressManager.getTrackedAddressCount());

        if (newEventHandler !== undefined) {
            this.eventHandler = newEventHandler;
        }

        // Unsubscribe from all current subscriptions
        this.unsubscribeCallbacksMap.forEach(unsubs => unsubs.forEach(unsub => unsub()));
        this.unsubscribeCallbacksMap.clear();

        if (!this.eventHandler) {
            console.warn("Event handler not set for EvmConnectionManager during update. Events might be missed.");
        }

        // Resubscribe to all chains
        evmChainsConfig.forEach(chain => {
            const client = this.publicClients.get(chain.id);
            if (client) {
                this.subscribeToBlocks(client, chain);
            } else {
                console.warn(`EVM Client for ${chain.name} not found during update. Re-initializing.`);
                try {
                    const newClient = this.initializeEvmClient(chain);
                    this.subscribeToBlocks(newClient, chain);
                } catch (error) {
                    console.error(`Failed to re-initialize or subscribe to ${chain.name} during update:`, error);
                }
            }
        });
    }

    // This method is kept for backward compatibility but delegates to updateConnections
    public updateTrackedAddresses(newAddressesHint: Hex[], newEventHandler?: EventHandlerCallback | null) {
        console.log("EvmConnectionManager: Received address update hint. Count:", newAddressesHint.length);
        // Address updates are handled by AddressManager, we just need to update connections
        this.updateConnections(newEventHandler);
    }

    public stop() {
        console.log("Stopping EVM WebSocket connections...");
        this.unsubscribeCallbacksMap.forEach((unsubs, chainId) => {
            console.log(`Unsubscribing from EVM chain ID: ${chainId}`);
            unsubs.forEach(unsub => unsub());
        });
        this.unsubscribeCallbacksMap.clear();
        this.publicClients.forEach((client, chainId) => {
            console.log(`Clearing EVM client for chain ID: ${chainId}`);
            // Viem's client doesn't have an explicit disconnect for WebSocket transport managed this way.
            // Closing the transport is more complex and might be handled by process exit or if client is recreated.
        });
        this.publicClients.clear(); // Clear clients if we want them re-created on next start
        console.log("All EVM subscriptions stopped and clients cleared.");
    }
} 