import { ChainMonitorManager } from './services/monitors/chainMonitorManager';
import type { UnifiedTransferEvent } from './services/monitors/chainMonitorManager';
import { AddressManager } from './services/address/addressManager';
import { TokenService } from './services/token/tokenService';
import logger from './config/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Sample Tron addresses for testing
const TEST_ADDRESSES = [
    'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8', // Binance hot wallet
    'TPHpCHSH7VmaxRDz4zXyV2bTLKJJFHVVs3', // Another high-volume address
];

// Event handler for transfer events
function handleTransferEvent(event: UnifiedTransferEvent): void {
    if (event.type === 'NATIVE') {
        logger.info(`[${event.chainId}] Native transfer detected:`, {
            from: event.data.from,
            to: event.data.to,
            value: event.data.value.toString(),
            hash: event.data.hash
        });
    } else if (event.type === 'ERC20') {
        logger.info(`[${event.chainId}] Token transfer detected:`, {
            from: event.data.from,
            to: event.data.to,
            value: event.data.value.toString(),
            token: event.data.tokenContract,
            hash: event.data.transactionHash
        });
    }
}

async function main() {
    try {
        // Initialize token service
        const tokenService = TokenService.getInstance();
        await tokenService.start();

        // Create a Tron-specific chain monitor manager
        const chainManager = new ChainMonitorManager(1, 'TRON'); // Refresh every 1 minute

        // Set the event handler
        chainManager.setEventHandler(handleTransferEvent);

        // Start with predefined test addresses
        await chainManager.startConnections(TEST_ADDRESSES);

        logger.info('Tron monitoring started. Press Ctrl+C to exit.');

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            logger.info('Shutting down...');
            chainManager.stopConnections();
            tokenService.stop();
            process.exit(0);
        });
    } catch (error) {
        logger.error('Error in main:', error);
        process.exit(1);
    }
}

main().catch(err => {
    logger.error('Unhandled error:', err);
    process.exit(1);
}); 