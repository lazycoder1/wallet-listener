import type { Hex } from 'viem';
import { EvmPollingMonitor } from './evmPollingMonitor';
import { TronPollingMonitor } from './tronPollingMonitor';
import { AddressManager } from '../address/addressManager';
import { AddressService } from '../address/addressService';
import logger from '../../config/logger';

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

export type ChainType = 'EVM' | 'TRON';

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
export class ChainMonitorManager {
    private eventHandler: EventHandlerCallback | null = null;
    private addressManager: AddressManager;
    private addressService: AddressService;
    private evmManager: EvmPollingMonitor | null = null;
    private tronManager: TronPollingMonitor | null = null;
    private refreshIntervalId: NodeJS.Timeout | null = null;
    private chainType: ChainType;
    private running: boolean = false;

    constructor(
        private readonly refreshIntervalMinutes: number = 5,
        chainType: ChainType = 'EVM'
    ) {
        this.addressManager = new AddressManager();
        this.addressService = new AddressService();
        this.chainType = chainType;
        logger.info(`ChainMonitorManager initialized for ${chainType} chains. Address refresh interval: ${refreshIntervalMinutes} minutes.`);
    }

    public setEventHandler(handler: EventHandlerCallback): void {
        logger.info("Global event handler set via ChainMonitorManager.");
        this.eventHandler = handler;
    }

    private async updateConnectionsWithNewAddresses(newAddresses: string[]): Promise<void> {
        this.addressManager.updateAddresses(newAddresses);
        const allTrackedAddresses = this.addressManager.getTrackedAddresses();
        logger.info("Internal: Updating connections. Current tracked addresses from AddressManager:", allTrackedAddresses);

        // Only update if managers exist and are running
        if (this.chainType === 'EVM' && this.evmManager && this.running) {
            const evmAddresses = allTrackedAddresses
                .filter(addr => typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42)
                .map(addr => addr.toLowerCase() as Hex);
            this.evmManager.updateTrackedAddresses(evmAddresses, this.eventHandler);
        } else if (this.chainType === 'TRON' && this.tronManager && this.running) {
            // Assuming tronManager can handle a string[] and does its own filtering/validation
            this.tronManager.updateTrackedAddresses(allTrackedAddresses, this.eventHandler);
        }
    }

    public async reloadAddressesFromDB(): Promise<void> {
        logger.info("Reloading addresses from DB...");
        try {
            const addressesFromDB = await this.addressService.getActiveAddresses(); // Returns string[]
            await this.updateConnectionsWithNewAddresses(addressesFromDB);
        } catch (error) {
            logger.error("Error reloading addresses from DB:", error);
        }
    }

    public async startConnections(initialAddresses?: string[]): Promise<void> {
        // Stop any existing connections first to prevent memory leaks
        if (this.running) {
            this.stopConnections();
        }

        if (initialAddresses && initialAddresses.length > 0) {
            this.addressManager.updateAddresses(initialAddresses); // AddressManager handles normalization
            logger.info("Starting connections with provided initial addresses. Count:", this.addressManager.getTrackedAddressCount());
        } else {
            logger.info("No initial addresses provided, attempting to load from DB...");
            await this.reloadAddressesFromDB();
        }

        logger.info(`Starting ${this.chainType} connections via ChainMonitorManager. Current tracked address count:`, this.addressManager.getTrackedAddressCount());

        if (!this.eventHandler) {
            logger.warn("Event handler not set in ChainMonitorManager before starting. Events might be missed.");
        }

        // Initialize and start the appropriate manager based on chain type
        if (this.chainType === 'EVM') {
            this.evmManager = new EvmPollingMonitor(this.addressManager, this.eventHandler);
            this.evmManager.start();
        } else if (this.chainType === 'TRON') {
            this.tronManager = new TronPollingMonitor(this.addressManager, this.eventHandler);
            this.tronManager.start();
        }

        // Start periodic refresh
        if (this.refreshIntervalMinutes > 0) {
            if (this.refreshIntervalId) {
                clearInterval(this.refreshIntervalId);
                this.refreshIntervalId = null;
            }
            this.refreshIntervalId = setInterval(async () => {
                logger.info(`Periodic refresh: Reloading addresses from DB (every ${this.refreshIntervalMinutes} mins)...`);
                await this.reloadAddressesFromDB();
            }, this.refreshIntervalMinutes * 60 * 1000);
            logger.info(`Periodic address refresh scheduled every ${this.refreshIntervalMinutes} minutes.`);
        }

        this.running = true;
        logger.info(`${this.chainType.toUpperCase()} connection manager started via ChainMonitorManager.`);
    }

    public stopConnections(): void {
        logger.info(`Stopping ${this.chainType} connections via ChainMonitorManager...`);

        if (this.refreshIntervalId) {
            clearInterval(this.refreshIntervalId);
            this.refreshIntervalId = null;
            logger.info("Stopped periodic address refresh.");
        }

        if (this.chainType === 'EVM' && this.evmManager) {
            this.evmManager.stop();
            this.evmManager = null;
        } else if (this.chainType === 'TRON' && this.tronManager) {
            this.tronManager.stop();
            this.tronManager = null;
        }

        this.running = false;
        logger.info(`${this.chainType.toUpperCase()} connection manager stopped via ChainMonitorManager.`);
    }

    /**
     * Check if the connection manager is currently running
     * @returns True if the connection manager is running, false otherwise
     */
    public isRunning(): boolean {
        return this.running;
    }

    /**
     * Get the number of addresses currently being tracked
     * @returns The number of tracked addresses
     */
    public getTrackedAddressCount(): number {
        return this.addressManager.getTrackedAddressCount();
    }

    public async setChainType(chainType: ChainType): Promise<void> {
        if (this.chainType === chainType) {
            logger.info(`Already using ${chainType} chain type.`);
            return;
        }

        logger.info(`Switching from ${this.chainType} to ${chainType} chain type...`);

        // Stop current connections
        this.stopConnections();

        // Update chain type
        this.chainType = chainType;

        // Start new connections
        await this.startConnections();
    }
}

// Example usage (illustrative, would typically be in your main server setup file like index.ts):
/*
import { handleWebSocketEvent } from './wsEventHandler'; // Assume this is your actual handler function

async function main() {
    const wsManager = new ChainMonitorManager(1); // Refresh every 1 minute for testing
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