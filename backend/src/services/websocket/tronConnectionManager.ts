import type { Hex } from 'viem'; // For trackedAddresses type consistency
import { config as appConfig } from '../../config';
// Import types from orchestrator - these will need to be exported from wsConnectionManager.ts
import type { UnifiedTransferEvent, EventHandlerCallback } from './wsConnectionManager';
import type { AddressManager } from '../address/addressManager';
import * as TronWeb from 'tronweb';

// Placeholder for Tron-specific client instance or connection references
// e.g., let tronWebsocketClient: any = null;

interface TronTransaction {
    txID: string;
    raw_data: {
        contract: Array<{
            type: string;
            parameter: {
                value: {
                    owner_address: string;
                    to_address?: string;
                    amount?: number;
                    contract_address?: string;
                    data?: string;
                };
                type_url: string;
            };
        }>;
    };
    ret: Array<{
        contractRet: string;
    }>;
    blockNumber: number;
}

interface TronEvent {
    transaction: string;
    blockNumber: number;
    contract_address: string;
    event_name: string;
    result: {
        from: string;
        to: string;
        value: string;
    };
}

export class TronConnectionManager {
    private tronWeb: any = null; // Using any for now since TronWeb types are not properly exposed
    private unsubscribeCallbacks: Array<() => void> = [];
    private addressManager: AddressManager;
    private eventHandler: EventHandlerCallback | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private readonly reconnectDelay = 5000; // 5 seconds

    constructor(addressManager: AddressManager, handler: EventHandlerCallback | null) {
        this.addressManager = addressManager;
        this.eventHandler = handler;
    }

    private initializeTronClient(): void {
        if (!appConfig.networks.tron.wsUrl) {
            throw new Error('Tron WebSocket URL is not configured');
        }

        console.log('Initializing TronWeb client on', appConfig.networks.tron.wsUrl);

        // Extract HTTP URL from WebSocket URL
        const httpUrl = appConfig.networks.tron.wsUrl.replace('wss://', 'https://').replace('ws://', 'http://');

        this.tronWeb = new (TronWeb as any).default({
            fullHost: httpUrl,
            headers: appConfig.networks.tron.apiKey ? {
                'TRON-PRO-API-KEY': appConfig.networks.tron.apiKey
            } : undefined
        });

        this.subscribeToEvents();
    }

    private subscribeToEvents(): void {
        if (!this.tronWeb) {
            console.warn('Cannot subscribe: TronWeb is not initialized');
            return;
        }

        // Subscribe to new blocks
        const blockSubscription = this.tronWeb.trx.subscribe('newBlock', (block: any) => {
            this.processBlock(block);
        });

        // Subscribe to contract events (for TRC20 transfers)
        const contractSubscription = this.tronWeb.trx.subscribe('contractLogTrigger', (event: any) => {
            this.processContractEvent(event);
        });

        this.unsubscribeCallbacks.push(
            () => blockSubscription.unsubscribe(),
            () => contractSubscription.unsubscribe()
        );
    }

    private processBlock(block: any): void {
        if (!block.transactions || !Array.isArray(block.transactions)) return;

        for (const tx of block.transactions) {
            this.processTransaction(tx);
        }
    }

    private processTransaction(tx: TronTransaction): void {
        if (!this.eventHandler) return;

        try {
            // Process native TRX transfers
            for (const contract of tx.raw_data.contract) {
                if (contract.type === 'TransferContract' && contract.parameter.value.to_address) {
                    const toAddress = this.tronWeb?.address.fromHex(contract.parameter.value.to_address);
                    if (toAddress && this.addressManager.isTracking(toAddress.toLowerCase() as Hex)) {
                        console.log(`[Tron] Native transfer to ${toAddress}:`, {
                            from: this.tronWeb?.address.fromHex(contract.parameter.value.owner_address),
                            to: toAddress,
                            value: contract.parameter.value.amount,
                            hash: tx.txID
                        });

                        this.eventHandler({
                            type: 'NATIVE',
                            chainId: 728126428, // Tron mainnet chain ID
                            data: {
                                from: this.tronWeb?.address.fromHex(contract.parameter.value.owner_address).toLowerCase() as Hex,
                                to: toAddress.toLowerCase() as Hex,
                                value: BigInt(contract.parameter.value.amount || 0),
                                hash: tx.txID as Hex,
                                blockNumber: BigInt(tx.blockNumber)
                            }
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error processing Tron transaction:', error);
        }
    }

    private processContractEvent(event: TronEvent): void {
        if (!this.eventHandler || !this.tronWeb) return;

        try {
            // Check if it's a Transfer event
            if (event.event_name === 'Transfer') {
                const toAddress = this.tronWeb.address.fromHex(event.result.to);
                if (this.addressManager.isTracking(toAddress.toLowerCase() as Hex)) {
                    console.log(`[Tron] TRC20 Transfer to ${toAddress}:`, {
                        from: this.tronWeb.address.fromHex(event.result.from),
                        to: toAddress,
                        value: event.result.value,
                        tokenContract: event.contract_address
                    });

                    this.eventHandler({
                        type: 'ERC20',
                        chainId: 728126428, // Tron mainnet chain ID
                        data: {
                            from: this.tronWeb.address.fromHex(event.result.from).toLowerCase() as Hex,
                            to: toAddress.toLowerCase() as Hex,
                            value: BigInt(event.result.value),
                            transactionHash: event.transaction as Hex,
                            blockNumber: BigInt(event.blockNumber),
                            logIndex: 0, // Tron doesn't provide log index
                            tokenContract: event.contract_address.toLowerCase() as Hex
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error processing Tron contract event:', error);
        }
    }

    public start(): void {
        console.log('Starting Tron WebSocket connections. Monitored addresses count:', this.addressManager.getTrackedAddressCount());
        if (!this.eventHandler) {
            console.warn('Event handler not set for TronConnectionManager. Events might be missed.');
        }
        this.initializeTronClient();
    }

    public updateConnections(newEventHandler?: EventHandlerCallback | null): void {
        console.log('TronConnectionManager: Updating connections. Current tracked address count:', this.addressManager.getTrackedAddressCount());

        if (newEventHandler !== undefined) {
            this.eventHandler = newEventHandler;
        }

        // Unsubscribe from current subscriptions
        this.unsubscribeCallbacks.forEach(unsub => unsub());
        this.unsubscribeCallbacks = [];

        // Reinitialize client and resubscribe
        this.initializeTronClient();
    }

    public updateTrackedAddresses(newAddressesHint: Hex[], newEventHandler?: EventHandlerCallback | null): void {
        console.log('TronConnectionManager: Received address update hint. Count:', newAddressesHint.length);
        this.updateConnections(newEventHandler);
    }

    public stop(): void {
        console.log('Stopping Tron WebSocket connections...');

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        // Unsubscribe from all subscriptions
        this.unsubscribeCallbacks.forEach(unsub => unsub());
        this.unsubscribeCallbacks = [];

        this.tronWeb = null;
        console.log('Tron WebSocket connections stopped');
    }
} 