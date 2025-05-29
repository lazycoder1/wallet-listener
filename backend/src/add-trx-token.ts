import { TokenService } from './services/token/tokenService';
import logger from './config/logger';

async function main() {
    try {
        // Initialize token service
        const tokenService = TokenService.getInstance();

        // Add TRX token
        await tokenService.addToken({
            symbol: 'TRX',
            name: 'TRON',
            decimals: 6,
            price: 0.15, // Example price, will be updated by price service
            addresses: {
                tron: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb' // TRX contract address
            }
        });

        logger.info('TRX token added successfully');

        // Add USDT on Tron
        await tokenService.addToken({
            symbol: 'USDT',
            name: 'Tether USD',
            decimals: 6,
            price: 1.0, // Stablecoin
            addresses: {
                tron: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT on Tron
                ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT on Ethereum
                bsc: '0x55d398326f99059fF775485246999027B3197955', // USDT on BSC
                polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' // USDT on Polygon
            }
        });

        logger.info('USDT token added successfully');

        process.exit(0);
    } catch (error) {
        logger.error('Error adding tokens:', error);
        process.exit(1);
    }
}

main().catch(err => {
    logger.error('Unhandled error:', err);
    process.exit(1);
}); 