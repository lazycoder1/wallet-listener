import type { Hex } from 'viem';
import { EvmConnectionManager } from './evmConnectionManager';
import { TronConnectionManager } from './tronConnectionManager';
import { AddressManager } from '../address/addressManager'; // Import AddressManager
// import { TronConnectionManager } from './tronConnectionManager'; // Placeholder for when Tron is class-based

// --- SHARED TYPES --- (Still exported for use by other parts of the application, like the handler itself)
export interface Erc20TransferEvent {
    from: Hex;
    to: Hex;
    value: bigint;
    transactionHash: Hex;
    blockNumber: bigint;
    logIndex: number;
    tokenContract: Hex;
}

export interface NativeTransferEvent {
    to: Hex;
    from: Hex;
    value: bigint;
    hash: Hex;
    blockNumber: bigint;
}

export type UnifiedTransferEvent =
    | { type: 'ERC20'; data: Erc20TransferEvent; chainId: number; }
    | { type: 'NATIVE'; data: NativeTransferEvent; chainId: number; };

export type EventHandlerCallback = (event: UnifiedTransferEvent) => void;

// --- MOCK DATABASE FUNCTION --- (Replace with actual DB call using Prisma)
async function fetchAddressesFromDB(): Promise<Hex[]> {
    console.log("[DB Mock] Fetching addresses from database...");
    // In a real scenario, this would query your Prisma client:
    // e.g., const activeCompanyAddresses = await prisma.companyAddress.findMany({ where: { isActive: true }, select: { address: { select: { address: true } } } });
    // return activeCompanyAddresses.map(ca => ca.address.address as Hex);
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate async call
    const mockAddresses: Hex[] = [
        '0xMockAddressFromDB1'.toLowerCase() as Hex,
        '0xMockAddressFromDB2'.toLowerCase() as Hex,
        // Add one of your actual test addresses if you want to see events for it during mock testing
        // '0xYOUR_TEST_ADDRESS_HERE' 
    ];
    console.log("[DB Mock] Found addresses:", mockAddresses);
    return mockAddresses;
}

// --- MAIN ORCHESTRATOR CLASS ---
export class WsConnectionManager {
    private eventHandler: EventHandlerCallback | null = null;
    private addressManager: AddressManager; // Use AddressManager instance
    private evmManager: EvmConnectionManager | null = null;
    private tronManager: TronConnectionManager | null = null;
    // private tronManager: TronConnectionManager | null = null; // Placeholder
    private refreshIntervalId: NodeJS.Timeout | null = null;

    constructor(private readonly refreshIntervalMinutes: number = 5) {
        this.addressManager = new AddressManager(); // Initialize AddressManager
        console.log(`WsConnectionManager initialized. Address refresh interval: ${refreshIntervalMinutes} minutes.`);
    }

    public setEventHandler(handler: EventHandlerCallback): void {
        console.log("Global event handler set via WsConnectionManager.");
        this.eventHandler = handler;
        if (this.evmManager) {
            // EvmManager will get AddressManager instance, so direct handler update might be less critical here
            // or EvmManager could have a method to update its handler if needed.
            // For now, EvmManager gets the handler at construction.
        }
    }

    private updateConnectionsWithNewAddresses(newAddresses: Hex[]): void {
        this.addressManager.updateAddresses(newAddresses); // Update AddressManager
        console.log("Internal: Updating connections. Current tracked addresses from AddressManager:", this.addressManager.getTrackedAddresses());

        if (this.evmManager) {
            // EvmConnectionManager will use the AddressManager instance passed to it,
            // so its internal filtering logic will automatically use the updated addresses.
            // However, we still need to tell EvmManager to potentially re-evaluate its subscriptions if addresses changed significantly
            // or if its subscription method depends on the current list (e.g. if it wasn't subscribing to all events).
            // The current EvmManager `updateTrackedAddresses` handles this by restarting subscriptions.
            // We need to ensure it gets the new handler if it changed too.
            this.evmManager.updateTrackedAddresses(this.addressManager.getTrackedAddresses(), this.eventHandler);
        }
        if (this.tronManager) {
            this.tronManager.updateTrackedAddresses(this.addressManager.getTrackedAddresses(), this.eventHandler);
        }
    }

    public async reloadAddressesFromDB(): Promise<void> {
        console.log("Reloading addresses from DB...");
        try {
            const addressesFromDB = await fetchAddressesFromDB();
            this.updateConnectionsWithNewAddresses(addressesFromDB);
        } catch (error) {
            console.error("Error reloading addresses from DB:", error);
        }
    }

    public async startConnections(initialAddresses?: Hex[]): Promise<void> {
        if (initialAddresses && initialAddresses.length > 0) {
            this.addressManager.updateAddresses(initialAddresses.map(a => a.toLowerCase() as Hex));
            console.log("Starting connections with provided initial addresses. Count:", this.addressManager.getTrackedAddressCount());
        } else {
            console.log("No initial addresses provided, attempting to load from DB...");
            await this.reloadAddressesFromDB(); // Load initial set from DB
        }

        console.log("Starting all WebSocket connections via WsConnectionManager. Current tracked address count:", this.addressManager.getTrackedAddressCount());

        if (!this.eventHandler) {
            console.warn("Event handler not set in WsConnectionManager before starting. Events might be missed.");
        }

        // Initialize and start EVM manager
        this.evmManager = new EvmConnectionManager(this.addressManager, this.eventHandler);
        this.evmManager.start();

        // Initialize and start Tron manager
        this.tronManager = new TronConnectionManager(this.addressManager, this.eventHandler);
        this.tronManager.start();

        // Start periodic refresh
        if (this.refreshIntervalMinutes > 0) {
            if (this.refreshIntervalId) clearInterval(this.refreshIntervalId);
            this.refreshIntervalId = setInterval(async () => {
                console.log(`Periodic refresh: Reloading addresses from DB (every ${this.refreshIntervalMinutes} mins)...`);
                await this.reloadAddressesFromDB();
            }, this.refreshIntervalMinutes * 60 * 1000);
            console.log(`Periodic address refresh scheduled every ${this.refreshIntervalMinutes} minutes.`);
        }

        console.log("All WebSocket connection managers started via WsConnectionManager.");
    }

    public stopConnections(): void {
        console.log("Stopping all WebSocket connections via WsConnectionManager...");

        if (this.refreshIntervalId) {
            clearInterval(this.refreshIntervalId);
            this.refreshIntervalId = null;
            console.log("Stopped periodic address refresh.");
        }

        if (this.evmManager) {
            this.evmManager.stop();
            this.evmManager = null; // Release reference
        }
        if (this.tronManager) {
            this.tronManager.stop();
            this.tronManager = null; // Release reference
        }

        console.log("All WebSocket connection managers stopped via WsConnectionManager.");
    }
}

// Example usage (illustrative, would typically be in your main server setup file like index.ts):
/*
import { handleWebSocketEvent } from './wsEventHandler'; // Assume this is your actual handler function

async function main() {
    const wsManager = new WsConnectionManager(1); // Refresh every 1 minute for testing
    wsManager.setEventHandler(handleWebSocketEvent);
    // Option 1: Start with addresses from DB
    await wsManager.startConnections();
    
    // Option 2: Start with a predefined list (DB load will be skipped initially)
    // const exampleAddresses: Hex[] = ['0xYourAddress1']; 
    // await wsManager.startConnections(exampleAddresses);

    // To manually trigger a reload:
    // setTimeout(async () => { await wsManager.reloadAddressesFromDB(); }, 30000); // after 30s

    // To stop (e.g., on server shutdown):
    // process.on('SIGINT', () => { wsManager.stopConnections(); process.exit(0); });
}

// main().catch(console.error);
*/ 