import axios from 'axios';
import { TokenService } from '../src/services/token/tokenService';
import logger from '../src/config/logger';

interface TronScanTRC20Transfer {
    transaction_id: string;
    block_timestamp: number;
    block: number;
    contract_address: string;
    from_address: string;
    to_address: string;
    value: string;
    quant: string;
    event_type: string;
    tokenInfo?: {
        tokenAbbr: string;
        tokenName: string;
        tokenDecimal: number;
    };
}

interface ScriptArgs {
    blockNumber: number;
    trackedAddresses: string[]; // Array of addresses to monitor
}

class BlockBasedTRC20Monitor {
    private tokenService: TokenService;
    private trackedTokens: Map<string, any> = new Map();
    private trackedAddressesSet: Set<string> = new Set();

    constructor() {
        this.tokenService = TokenService.getInstance();
    }

    async initialize() {
        // Load all TRC20 tokens we're tracking
        const tronTokens = await this.tokenService.getTronTokens();
        for (const token of tronTokens) {
            // Find the TRON address in the addresses array
            const tronAddress = token.addresses.find(addr => addr.chain === 'tron');
            if (tronAddress) {
                this.trackedTokens.set(tronAddress.address.toLowerCase(), token);
            }
        }

        logger.info(`Loaded ${this.trackedTokens.size} tracked TRC20 tokens`);
    }

    setTrackedAddresses(addresses: string[]) {
        this.trackedAddressesSet = new Set(addresses.map(addr => addr.toLowerCase()));
        logger.info(`Tracking ${this.trackedAddressesSet.size} wallet addresses`);
    }

    /**
     * SCALABLE APPROACH: Get ALL TRC20 transfers in a block (similar to EVM)
     * This scales with number of tokens, not number of wallet addresses
     */
    async getAllTRC20TransfersInBlock(blockNumber: number): Promise<TronScanTRC20Transfer[]> {
        try {
            const allTransfers: TronScanTRC20Transfer[] = [];

            // For each tracked TRC20 token, get ALL transfers in the block
            for (const [contractAddress, tokenInfo] of this.trackedTokens) {
                logger.info(`Fetching transfers for ${tokenInfo.symbol} in block ${blockNumber}...`);

                const url = 'https://apilist.tronscanapi.com/api/token_trc20/transfers';
                const params = {
                    contract_address: contractAddress,
                    start_block: blockNumber.toString(),
                    end_block: blockNumber.toString(),
                    limit: '200',
                    start: '0'
                };

                try {
                    const response = await axios.get(url, {
                        params,
                        timeout: 15000
                    });

                    if (response.data && response.data.data && Array.isArray(response.data.data)) {
                        const tokenTransfers = response.data.data;
                        logger.info(`Found ${tokenTransfers.length} ${tokenInfo.symbol} transfers in block ${blockNumber}`);
                        allTransfers.push(...tokenTransfers);
                    }
                } catch (error) {
                    logger.error(`Error fetching ${tokenInfo.symbol} transfers for block ${blockNumber}:`, error);
                }
            }

            logger.info(`Total TRC20 transfers found in block ${blockNumber}: ${allTransfers.length}`);
            return allTransfers;

        } catch (error) {
            logger.error(`Error fetching TRC20 transfers for block ${blockNumber}:`, error);
            return [];
        }
    }

    /**
     * Filter transfers to only those involving our tracked wallet addresses
     * This is done AFTER fetching all transfers in the block
     */
    filterRelevantTransfers(transfers: TronScanTRC20Transfer[]): TronScanTRC20Transfer[] {
        const relevantTransfers = transfers.filter(transfer => {
            const fromAddress = transfer.from_address.toLowerCase();
            const toAddress = transfer.to_address.toLowerCase();

            // Check if either from or to address is in our tracked set
            return this.trackedAddressesSet.has(fromAddress) || this.trackedAddressesSet.has(toAddress);
        });

        logger.info(`Found ${relevantTransfers.length} relevant transfers out of ${transfers.length} total`);
        return relevantTransfers;
    }

    /**
     * Process and display transfer information
     */
    async processTransfers(transfers: TronScanTRC20Transfer[]) {
        logger.info('\n=== Processing Relevant Transfers ===');

        for (const transfer of transfers) {
            const tokenInfo = this.trackedTokens.get(transfer.contract_address.toLowerCase());
            const tokenSymbol = tokenInfo?.symbol || transfer.tokenInfo?.tokenAbbr || 'Unknown';
            const tokenDecimals = tokenInfo?.decimals || transfer.tokenInfo?.tokenDecimal || 6;
            const tokenPrice = tokenInfo?.price || 0;

            // Format amount
            const rawAmount = BigInt(transfer.quant);
            const divisor = BigInt(10) ** BigInt(tokenDecimals);
            const formattedAmount = (Number(rawAmount) / Number(divisor)).toFixed(6);

            // Calculate USD value
            const usdValue = tokenPrice ? parseFloat(formattedAmount) * tokenPrice : 0;

            // Check direction
            const isIncoming = this.trackedAddressesSet.has(transfer.to_address.toLowerCase());
            const direction = isIncoming ? 'INCOMING' : 'OUTGOING';

            logger.info(`\n--- ${direction} ${tokenSymbol} Transfer ---`);
            logger.info(`Transaction: ${transfer.transaction_id}`);
            logger.info(`From: ${transfer.from_address}`);
            logger.info(`To: ${transfer.to_address}`);
            logger.info(`Amount: ${formattedAmount} ${tokenSymbol}`);
            logger.info(`USD Value: $${usdValue.toFixed(2)}`);
            logger.info(`Block: ${transfer.block}`);
        }
    }

    /**
     * Main monitoring function for a specific block
     */
    async monitorBlock(blockNumber: number): Promise<void> {
        logger.info(`\n=== Starting Block-Based TRC20 Monitoring ===`);
        logger.info(`Block: ${blockNumber}`);
        logger.info(`Tracked Tokens: ${this.trackedTokens.size}`);
        logger.info(`Tracked Addresses: ${this.trackedAddressesSet.size}`);

        // Step 1: Get ALL TRC20 transfers in the block (scalable approach)
        const allTransfers = await this.getAllTRC20TransfersInBlock(blockNumber);

        if (allTransfers.length === 0) {
            logger.info('No TRC20 transfers found in this block');
            return;
        }

        // Step 2: Filter for transfers involving our tracked addresses
        const relevantTransfers = this.filterRelevantTransfers(allTransfers);

        if (relevantTransfers.length === 0) {
            logger.info('No relevant transfers found for tracked addresses');
            return;
        }

        // Step 3: Process and display relevant transfers
        await this.processTransfers(relevantTransfers);

        logger.info(`\n=== Summary ===`);
        logger.info(`Total API calls made: ${this.trackedTokens.size} (one per tracked token)`);
        logger.info(`Total transfers in block: ${allTransfers.length}`);
        logger.info(`Relevant transfers found: ${relevantTransfers.length}`);
    }
}

// Main execution function
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: npx ts-node scripts/monitor_trc20_block_based.ts <blockNumber> <address1> [address2] [address3]...');
        console.log('Example: npx ts-node scripts/monitor_trc20_block_based.ts 72966511 TE2sXtdsrFooxeF2nzANfadN73JvKmos3t');
        process.exit(1);
    }

    const blockNumber = parseInt(args[0]);
    const trackedAddresses = args.slice(1);

    if (isNaN(blockNumber)) {
        console.error('Invalid block number');
        process.exit(1);
    }

    try {
        const monitor = new BlockBasedTRC20Monitor();
        await monitor.initialize();
        monitor.setTrackedAddresses(trackedAddresses);

        await monitor.monitorBlock(blockNumber);

    } catch (error) {
        logger.error('Error during monitoring:', error);
        process.exit(1);
    }
}

// Run the script
main().catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
});

export { BlockBasedTRC20Monitor }; 