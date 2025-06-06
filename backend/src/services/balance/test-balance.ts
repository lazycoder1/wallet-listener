import { BalanceService } from './balanceService';
import { config } from '../../config';
import logger from '../../config/logger';

async function testBalanceService() {
    try {
        console.log('=== Balance Service Test ===');

        // Check API key configuration
        const apiKey = config.alchemy.apiKey;
        console.log('API Key configured:', apiKey ? 'YES' : 'NO');

        const service = BalanceService.getInstance();
        const testAddress = '0xD50a6bF340242c4a555618aABaa31765432e8F5a';

        console.log('Test Address:', testAddress);
        console.log('---');

        // Test Alchemy EVM balance
        console.log('Fetching EVM balance using Alchemy...');
        const start = Date.now();
        const balance = await service.getTotalBalanceAlchemy(testAddress);
        const elapsed = Date.now() - start;

        console.log(`✅ EVM Balance: $${balance.toFixed(2)}`);
        console.log(`⏱️  Fetch time: ${elapsed}ms`);

        // Test TRON balance (example - uncomment if you have a TRON address)
        // const tronAddress = 'TYour-TRON-Address-Here';
        // const tronResult = await service.fetchTronScanTokenBalances(tronAddress);
        // console.log(`✅ TRON Balance: $${tronResult.totalUsdBalance.toFixed(2)}`);

        console.log('🎉 Test completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
        }
        logger.error('Balance service test failed', { error });
    }
}

// Run the test
testBalanceService(); 